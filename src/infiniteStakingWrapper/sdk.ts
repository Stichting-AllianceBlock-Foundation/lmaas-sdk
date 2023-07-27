import Decimal from 'decimal.js';
import { formatEther, formatUnits, PublicClient, WalletClient } from 'viem';

import {
  accuracy,
  approveToken,
  CampaignRewardsNew,
  CoinGecko,
  formatStakingDuration,
  formatToken,
  formatValuesToString,
  getAddressFromWallet,
  getAllowance,
  getBalance,
  getTokenByPropName,
  getTokenDecimals,
  getTotalSupply,
  InfiniteStakingInterface,
  InfiniteStakingState,
  NetworkEnum,
  poolTupleToString,
  PoolVersion,
  Result,
  stableCoinsIds,
  TokenConfigs,
  TokenConfigsProps,
  UserRewards,
  year,
} from '..';
import { AbPoolABI } from '../abi/AllianceBlockDexPoolABI';
import { InfiniteStaker } from '../istaking/sdk';

export class InfiniteStakingWrapper {
  provider: PublicClient;
  infiniteStaker: InfiniteStaker;
  coingecko: CoinGecko;
  tokenConfigs: TokenConfigs;
  protocol: NetworkEnum;

  constructor(
    provider: PublicClient,
    infiniteStaker: InfiniteStaker,
    coingecko: CoinGecko,
    protocol: NetworkEnum,
    tokenConfigs: TokenConfigs,
  ) {
    this.provider = provider;
    this.infiniteStaker = infiniteStaker;
    this.coingecko = coingecko;
    this.protocol = protocol;
    this.tokenConfigs = tokenConfigs;
  }

  async stake(
    wallet: WalletClient,
    campaign: InfiniteStakingInterface,
    amountToStake: string,
  ): Promise<`0x${string}`> {
    const { campaignAddress, campaignTokenAddress } = campaign;

    return this.infiniteStaker.stake(campaignAddress, campaignTokenAddress, amountToStake, wallet);
  }

  async exit(wallet: WalletClient, campaign: InfiniteStakingInterface) {
    return this.infiniteStaker.exit(campaign.campaignAddress, wallet);
  }

  async getCardDataCommon(wallet: WalletClient, campaign: InfiniteStakingInterface) {
    const walletAddress = await getAddressFromWallet(wallet);
    const { campaignAddress, campaignTokenAddress } = campaign;

    const userBalance = await getBalance(
      this.provider,
      campaignTokenAddress as `0x${string}`,
      walletAddress,
    );
    const userWalletTokensBalance = await formatToken(
      this.provider,
      userBalance,
      campaignTokenAddress as `0x${string}`,
    );

    const emptyCardData = await this._getCampaignData(campaign);

    const state = await this.getState(wallet, campaignAddress);

    const {
      userStakedAmount: userStakedAmountBN,
      userRewards,
      userCanExit,
    } = await this.infiniteStaker.getUserData(campaignAddress, wallet);

    const userStakedAmount = await formatToken(
      this.provider,
      userStakedAmountBN,
      campaignTokenAddress as `0x${string}`,
    );

    const rewards = this._formatUserRewards(userRewards);

    return {
      ...emptyCardData,
      emptyCardData: false,
      state,
      userCanExit,
      userStakedAmount,
      userWalletTokensBalance,
      rewards,
    };
  }

  async getEmptyCardDataCommon(campaign: InfiniteStakingInterface) {
    return this._getCampaignData(campaign);
  }

  async getState(wallet: WalletClient, campaignAddress: string): Promise<InfiniteStakingState> {
    const state = await this.getDisconnectedState(campaignAddress);
    const userData = await this.infiniteStaker.getUserData(campaignAddress, wallet);

    if (userData.userStakedAmount > 0n) {
      return state === InfiniteStakingState.STARTED_WITH_REWARDS
        ? InfiniteStakingState.STAKED_WITH_REWARDS
        : state === InfiniteStakingState.STARTED_WITH_UNLOCKED_REWARDS
        ? InfiniteStakingState.STAKED_WITH_UNLOCKED_REWARDS
        : InfiniteStakingState.STAKED_WITHOUT_REWARDS;
    }

    return state;
  }

  async getDisconnectedState(campaignAddress: string): Promise<InfiniteStakingState> {
    const { hasCampaignStarted, rewardsDistributing, unlockedRewards } =
      await this.infiniteStaker.getCampaignStatus(campaignAddress);

    if (!hasCampaignStarted) {
      return InfiniteStakingState.NOT_STARTED;
    }

    return rewardsDistributing
      ? InfiniteStakingState.STARTED_WITH_REWARDS
      : unlockedRewards
      ? InfiniteStakingState.STARTED_WITH_UNLOCKED_REWARDS
      : InfiniteStakingState.STARTED_WITHOUT_REWARDS;
  }

  async _getCampaignData(campaign: InfiniteStakingInterface) {
    //Get campaign data
    const { campaignAddress, campaignTokenAddress } = campaign;

    // Get tokenInstance

    // If this is a liquidity provider, then try to get the function getReservers()
    let isLpToken: boolean = false;
    let token0: string = '';
    let token1: string = '';

    try {
      token0 = await this.provider.readContract({
        abi: AbPoolABI,
        address: campaignTokenAddress as `0x${string}`,
        functionName: 'token0',
      });
      token1 = await this.provider.readContract({
        abi: AbPoolABI,
        address: campaignTokenAddress as `0x${string}`,
        functionName: 'token1',
      });

      isLpToken = true;
    } catch (error) {}

    let stakingToken: any;
    let stakingTokenPrice = 0;
    let symbol: string = '';

    if (!isLpToken) {
      // Get staking & rewards token data
      stakingToken = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        campaignTokenAddress,
      );

      const { coinGeckoID: stakingTokenId } = stakingToken;
      symbol = stakingToken.symbol;
      stakingTokenPrice = await this.coingecko.getTokenPrice(stakingTokenId, 'usd');
    } else {
      symbol = 'LP';
    }

    // Get data from new SDK
    const campaignData = await this.infiniteStaker.getCampaignData(campaignAddress);

    const {
      totalStaked: totalStakedBN,
      hasCampaignStarted,
      contractStakeLimit: contractStakeLimitBN,
      walletStakeLimit: walletStakeLimitBN,
      hasContractStakeLimit,
      hasWalletStakeLimit: hasUserStakeLimit,
      deltaExpiration,
      deltaDuration,
      campaignRewards: campaignRewardsBN,
      name,
      campaignStartTimestamp,
      campaignEndTimestamp,
      rewardsCount,
    } = campaignData;

    if (!hasCampaignStarted) {
      return {};
    }

    const tokenDecimals = await getTokenDecimals(
      this.provider,
      campaignTokenAddress as `0x${string}`,
    );

    // Format values
    const [totalStaked, contractStakeLimit, walletStakeLimit] = formatValuesToString(
      [totalStakedBN, contractStakeLimitBN, walletStakeLimitBN],
      tokenDecimals,
    );

    // Format durations
    const { duration: durationMilliseconds, expirationTime } = this._formatDurationExpiration(
      Number(deltaDuration),
      Number(deltaExpiration),
    );

    const upcoming = Number(campaignStartTimestamp) > Math.floor(Date.now() / 1000);

    const duration = formatStakingDuration(durationMilliseconds);

    // Format campaign rewards
    const { campaignRewards, campaignRewardsUSD } = await this._formatCampaignRewards(
      rewardsCount,
      campaignRewardsBN,
    );

    const campaignRewardsPerDayUSD = (campaignRewardsUSD * 24 * 3600) / Number(deltaDuration);

    // Calculate percentage limit
    const percentage = this._calculatePercentageLimit(totalStaked, contractStakeLimit);

    // Get data for APY calculation
    let totalStakedUSD = Number(totalStaked) * stakingTokenPrice;

    if (isLpToken) {
      totalStakedUSD = await this._getTotalStakedUSD(
        campaignTokenAddress,
        [token0, token1],
        Number(totalStaked),
      );
    }

    // Calculate APY
    const apy = this._calculateAPY_new(totalStakedUSD, campaignRewardsPerDayUSD);

    const pair = {
      symbol,
      address: campaignTokenAddress.toLowerCase(),
    };

    const state = await this.getDisconnectedState(campaignAddress);

    return {
      apy,
      campaign: {
        ...campaign,
        name,
        isLpToken,
        campaignStart: Number(campaignStartTimestamp),
        campaignEnd: Number(campaignEndTimestamp),
      },
      contractStakeLimit,
      campaignRewards,
      emptyCardData: true,
      expirationTime,
      expired: expirationTime < 0,
      duration,
      rawDuration: durationMilliseconds,
      hasContractStakeLimit,
      hasUserStakeLimit,
      hasCampaignStarted,
      pair,
      percentage,
      stakeLimit: walletStakeLimit,
      state,
      totalStaked,
      totalStakedUSD,
      upcoming,
    };
  }

  _formatDurationExpiration(deltaDuration: number, deltaExpiration: number) {
    const duration = deltaDuration * 1000;
    const durationDays = deltaDuration / (60 * 60 * 24);
    const expirationTime = deltaExpiration * 1000;

    return {
      duration,
      durationDays,
      expirationTime,
    };
  }

  _formatUserRewards(userRewards: UserRewards[]) {
    const rewards = userRewards.map(r => {
      const tokenAddress = r.tokenAddress.toLowerCase();
      const { symbol: tokenName, decimals: tokenDecimals } = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        tokenAddress,
      );
      const tokenAmount = formatUnits(r.currentAmount, tokenDecimals);

      return {
        tokenAmount,
        tokenName,
        tokenAddress,
      };
    });

    return rewards;
  }

  async _formatCampaignRewards(
    rewardsCount: bigint,
    campaignRewardsBN: CampaignRewardsNew[],
    version?: PoolVersion,
  ) {
    const secondsInWeek = 604800n;

    const total = [];
    const weekly = [];
    let campaignRewardsUSD = 0;

    for (let i = 0; i < rewardsCount; i++) {
      const currentReward = campaignRewardsBN[i];
      const tokenAddress = currentReward.tokenAddress.toLowerCase();
      const {
        symbol: tokenName,
        coinGeckoID: tokenId,
        decimals: tokenDecimals,
      } = getTokenByPropName(this.tokenConfigs, TokenConfigsProps.ADDRESS, tokenAddress);

      const tokenAmount = formatUnits(currentReward.totalRewards, tokenDecimals);
      const tokenAmountWeekly = formatUnits(
        (currentReward.rewardPerSecond / (version === '4.0' ? accuracy : 1n)) * secondsInWeek,
        tokenDecimals,
      );

      total.push({
        tokenAddress,
        tokenAmount,
        tokenName,
      });

      weekly.push({
        tokenAddress,
        tokenAmount: tokenAmountWeekly,
        tokenName,
      });

      // Get reward price in USD from Coingecko
      const priceUSD = stableCoinsIds.includes(tokenId)
        ? 1
        : await this.coingecko.getTokenPrice(tokenId, 'usd');
      const amountUSD = priceUSD * Number(tokenAmount);
      campaignRewardsUSD = campaignRewardsUSD + amountUSD;
    }

    const campaignRewards = {
      total,
      weekly,
    };

    return {
      campaignRewards,
      campaignRewardsUSD,
    };
  }

  _calculatePercentageLimit(totalStaked: string, contractStakeLimit: string) {
    const zeroBN = new Decimal(0);
    const totalStakedBigNumber = new Decimal(totalStaked);
    const contractStakeLimitBigNumber = new Decimal(contractStakeLimit);

    const percentageBigNumber =
      totalStakedBigNumber.gt(zeroBN) && contractStakeLimitBigNumber.gt(zeroBN)
        ? totalStakedBigNumber.div(contractStakeLimitBigNumber)
        : zeroBN;

    return Number(percentageBigNumber.toString()) * 100;
  }

  _calculateAPY_new(totalStakedUSD: number, campaignRewardsPerDayUSD: number) {
    return totalStakedUSD > 0 ? (campaignRewardsPerDayUSD / totalStakedUSD) * year * 100 : 0;
  }

  async _getTotalStakedUSD(
    poolAddress: string,
    provisionTokensAddresses: string[],
    totalStaked: number,
  ) {
    // Get pool data
    const liquidityPoolSupply = await getTotalSupply(this.provider, poolAddress as `0x${string}`);
    const liquidityPoolSupplyFormated = Number(formatEther(liquidityPoolSupply));

    const reservesBalances = await this.getPoolReserveBalances(
      poolAddress,
      provisionTokensAddresses,
    );

    const stakedRatio = totalStaked / liquidityPoolSupplyFormated;
    let totalStakedUSD = 0;

    for (let i = 0; i < provisionTokensAddresses.length; i++) {
      const { symbol, coinGeckoID } = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        provisionTokensAddresses[i].toLowerCase(),
      );

      // Get reward price in USD from Coingecko
      const priceUSD = stableCoinsIds.includes(coinGeckoID)
        ? 1
        : await this.coingecko.getTokenPrice(coinGeckoID, 'usd');

      const amountUSD = priceUSD * reservesBalances[symbol] * stakedRatio;
      totalStakedUSD = totalStakedUSD + amountUSD;
    }

    return totalStakedUSD;
  }

  async getPoolReserveBalances(
    poolAddress: string,
    provisionTokensAddresses: string[],
  ): Promise<Result> {
    const reserves = await this.provider.readContract({
      abi: AbPoolABI,
      address: poolAddress as `0x${string}`,
      functionName: 'getReserves',
    });

    const tokenNames = provisionTokensAddresses.map(
      tokenAddress =>
        getTokenByPropName(this.tokenConfigs, TokenConfigsProps.ADDRESS, tokenAddress.toLowerCase())
          .symbol,
    );

    const totalSupply = await this.provider.readContract({
      abi: AbPoolABI,
      address: poolAddress as `0x${string}`,
      functionName: 'totalSupply',
    });
    const pool = poolTupleToString(tokenNames);
    const result: Result = {};
    result[pool] = await formatToken(this.provider, totalSupply, poolAddress as `0x${string}`);

    for (let index = 0; index < tokenNames.length; index++) {
      const tokenName = tokenNames[index];
      const tokenAddress = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.SYMBOL,
        tokenName,
      ).address;

      result[tokenName] = await formatToken(this.provider, reserves[index], tokenAddress);
    }
    return result;
  }

  async getAllowance(wallet: WalletClient, campaign: InfiniteStakingInterface) {
    const { campaignAddress: stakerContractAddress, campaignTokenAddress: stakeTokenAddress } =
      campaign;

    return getAllowance(
      wallet,
      this.provider,
      stakeTokenAddress as `0x${string}`,
      stakerContractAddress as `0x${string}`,
    );
  }

  async approveToken(wallet: WalletClient, campaign: InfiniteStakingInterface) {
    const { campaignAddress: stakerContractAddress, campaignTokenAddress: stakeTokenAddress } =
      campaign;

    return approveToken(
      wallet,
      this.provider,
      stakeTokenAddress as `0x${string}`,
      stakerContractAddress as `0x${string}`,
    );
  }
}

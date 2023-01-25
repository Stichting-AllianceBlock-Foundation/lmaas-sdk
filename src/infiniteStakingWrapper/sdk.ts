import { Contract } from '@ethersproject/contracts';
import { JsonRpcBatchProvider, JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import { BigNumber as BigNumberJS } from 'bignumber.js';
import { BigNumber, providers } from 'ethers';
import { formatEther, formatUnits } from 'ethers/lib/utils';

import {
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
  getTotalSupply,
  InfiniteStakingInterface,
  InfiniteStakingState,
  NetworkEnum,
  poolTupleToString,
  Result,
  stableCoinsIds,
  TokenConfigs,
  TokenConfigsProps,
  UserRewards,
  year,
} from '..';
import LpABI from '../abi/AllianceBlockDexPoolABI.json';
import { InfiniteStaker } from '../istaking/sdk';

export class InfiniteStakingWrapper {
  provider: JsonRpcProvider | JsonRpcBatchProvider;
  infiniteStaker: InfiniteStaker;
  coingecko: CoinGecko;
  tokenConfigs: TokenConfigs;
  protocol: NetworkEnum;

  constructor(
    provider: JsonRpcProvider | JsonRpcBatchProvider,
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
    userWallet: JsonRpcSigner,
    campaign: InfiniteStakingInterface,
    amountToStake: string,
  ): Promise<providers.TransactionResponse> {
    const { campaignAddress, campaignTokenAddress } = campaign;

    return this.infiniteStaker.stake(
      campaignAddress,
      campaignTokenAddress,
      amountToStake,
      userWallet,
    );
  }

  async exit(userWallet: JsonRpcSigner, campaign: InfiniteStakingInterface) {
    return this.infiniteStaker.exit(campaign.campaignAddress, userWallet);
  }

  async getCardDataCommon(userWallet: JsonRpcSigner, campaign: InfiniteStakingInterface) {
    const userAddress = await getAddressFromWallet(userWallet);
    const { campaignAddress, campaignTokenAddress } = campaign;

    const userBalance = await getBalance(
      this.provider as JsonRpcProvider,
      campaignTokenAddress,
      userAddress,
    );
    const userWalletTokensBalance = await formatToken(
      this.provider as JsonRpcProvider,
      userBalance,
      campaignTokenAddress,
    );

    const emptyCardData = await this._getCampaignData(campaign);

    const state = await this.getState(userWallet, campaignAddress);

    const {
      userStakedAmount: userStakedAmountBN,
      userRewards,
      userCanExit,
    } = await this.infiniteStaker.getUserData(campaignAddress, userWallet);

    const userStakedAmount = await formatToken(
      this.provider as JsonRpcProvider,
      userStakedAmountBN,
      campaignTokenAddress,
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

  async getState(
    userWallet: JsonRpcSigner,
    campaignAddress: string,
  ): Promise<InfiniteStakingState> {
    const state = await this.getDisconnectedState(campaignAddress);
    const userData = await this.infiniteStaker.getUserData(campaignAddress, userWallet);

    if (userData.userStakedAmount.gt(0)) {
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
    const tokenLpInstance = new Contract(campaignTokenAddress, LpABI, this.provider);

    // If this is a liquidity provider, then try to get the function getReservers()
    let isLpToken: boolean = false;
    let token0: string = '';
    let token1: string = '';

    try {
      token0 = await tokenLpInstance.token0();
      token1 = await tokenLpInstance.token1();

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
      campaignStartTimestamp: campaignStartTimestampBN,
      campaignEndTimestamp: campaignEndTimestampBN,
      rewardsCount,
    } = campaignData;

    if (!hasCampaignStarted) {
      return {};
    }

    // Format values
    const [totalStaked, contractStakeLimit, walletStakeLimit] = formatValuesToString([
      totalStakedBN,
      contractStakeLimitBN,
      walletStakeLimitBN,
    ]);

    // Format durations
    const { duration: durationMilliseconds, expirationTime } = this._formatDurationExpiration(
      deltaDuration.toNumber(),
      deltaExpiration.toNumber(),
    );

    const campaignStartTimestamp = campaignStartTimestampBN.toNumber() * 1000;
    const campaignEndTimestamp = campaignEndTimestampBN.toNumber() * 1000;

    const duration = formatStakingDuration(durationMilliseconds);

    // Format campaign rewards
    const { campaignRewards, campaignRewardsUSD } = await this._formatCampaignRewards(
      rewardsCount,
      campaignRewardsBN,
    );
    const campaignRewardsPerDayUSD = (campaignRewardsUSD * 24 * 3600) / deltaDuration.toNumber();

    // Calculate percentage limit
    const percentage = this._calculatePercentageLimit(
      Number(totalStaked),
      Number(contractStakeLimit),
    );

    // Get data for APY calculation
    let totalStakedUSD = Number(totalStaked) * stakingTokenPrice;

    if (isLpToken) {
      totalStakedUSD = await this._getTotalStakedUSD(
        campaignTokenAddress,
        [token0, token1],
        Number(totalStaked),
        tokenLpInstance,
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
      campaign: { ...campaign, name, isLpToken },
      contractStakeLimit,
      campaignStartTimestamp,
      campaignEndTimestamp,
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
      const tokenAmount = formatUnits(r.currentAmount.toString(), tokenDecimals);

      return {
        tokenAmount,
        tokenName,
        tokenAddress,
      };
    });

    return rewards;
  }

  async _formatCampaignRewards(rewardsCount: number, campaignRewardsBN: CampaignRewardsNew[]) {
    const secondsInWeek = 604800;
    const secondsInWeekBN = BigNumber.from(secondsInWeek);

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

      const tokenAmount = formatUnits(currentReward.totalRewards.toString(), tokenDecimals);
      const tokenAmountWeekly = formatUnits(
        BigNumber.from(currentReward.rewardPerSecond).mul(secondsInWeekBN).toString(),
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

  _calculatePercentageLimit(totalStaked: number, contractStakeLimit: number) {
    const zeroBN = new BigNumberJS(0);
    const totalStakedBigNumber = new BigNumberJS(totalStaked);
    const contractStakeLimitBigNumber = new BigNumberJS(contractStakeLimit);

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
    poolContract: Contract,
  ) {
    // Get pool data
    const liquidityPoolSupply = await getTotalSupply(this.provider as JsonRpcProvider, poolAddress);
    const liquidityPoolSupplyFormated = Number(formatEther(liquidityPoolSupply.toString()));

    const reservesBalances = await this.getPoolReserveBalances(
      poolAddress,
      provisionTokensAddresses,
      poolContract,
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
    poolContract: Contract,
  ): Promise<Result> {
    const reserves = await poolContract.getReserves();
    const tokenNames = provisionTokensAddresses.map(
      tokenAddress =>
        getTokenByPropName(this.tokenConfigs, TokenConfigsProps.ADDRESS, tokenAddress.toLowerCase())
          .symbol,
    );

    const totalSupply = await poolContract.totalSupply();
    const pool = poolTupleToString(tokenNames);
    const result: Result = {};
    result[pool] = await formatToken(this.provider as JsonRpcProvider, totalSupply, poolAddress);

    for (let index = 0; index < tokenNames.length; index++) {
      const tokenName = tokenNames[index];
      const tokenAddress = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.SYMBOL,
        tokenName,
      ).address;

      result[tokenName] = await formatToken(
        this.provider as JsonRpcProvider,
        reserves[index],
        tokenAddress,
      );
    }
    return result;
  }

  async getAllowance(userWallet: JsonRpcSigner, campaign: InfiniteStakingInterface) {
    const { campaignAddress: stakerContractAddress, campaignTokenAddress: stakeTokenAddress } =
      campaign;

    return getAllowance(userWallet, stakeTokenAddress, stakerContractAddress);
  }

  async approveToken(userWallet: JsonRpcSigner, campaign: InfiniteStakingInterface) {
    const { campaignAddress: stakerContractAddress, campaignTokenAddress: stakeTokenAddress } =
      campaign;

    return approveToken(userWallet, stakeTokenAddress, stakerContractAddress);
  }
}

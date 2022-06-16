import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcBatchProvider, JsonRpcSigner, Web3Provider } from '@ethersproject/providers';
import { formatEther, formatUnits } from '@ethersproject/units';

import {
  approveToken,
  CampaignRewards,
  CoinGecko,
  formatStakingDuration,
  formatToken,
  formatValuesToString,
  getAddressFromWallet,
  getAllowance,
  getBalance,
  getTokenByPropName,
  getTotalSupply,
  NetworkEnum,
  poolTupleToString,
  Result,
  stableCoinsIds,
  StakerSolo,
  StakingInterface,
  TokenConfigs,
  TokenConfigsProps,
  UserRewards,
  year,
} from '..';
import LpABI from '../abi/AllianceBlockDexPoolABI.json';
import NonCompoundingRewardsPoolABI from '../abi/NonCompoundingRewardsPool.json';

export class SoloStakerWrapper {
  provider: Web3Provider | JsonRpcBatchProvider;
  soloNonComp: StakerSolo;
  coingecko: CoinGecko;
  tokenConfigs: TokenConfigs;
  protocol: NetworkEnum;
  [key: string]: any;

  constructor(
    provider: Web3Provider | JsonRpcBatchProvider,
    soloNonComp: StakerSolo,
    coingecko: CoinGecko,
    protocol: NetworkEnum,
    tokenConfigs: TokenConfigs,
  ) {
    this.provider = provider;
    this.soloNonComp = soloNonComp;
    this.coingecko = coingecko;
    this.protocol = protocol;
    this.tokenConfigs = tokenConfigs;
  }

  stake(campaign: StakingInterface, amountToStake: string) {
    const { campaignAddress } = campaign;

    return this.soloNonComp.stake(campaignAddress, amountToStake, false);
  }

  exit(campaign: StakingInterface) {
    const { campaignAddress } = campaign;

    return this.soloNonComp.exit(campaignAddress);
  }

  completeExit(campaign: StakingInterface) {
    const { campaignAddress } = campaign;

    return this.soloNonComp.completeExit(campaignAddress);
  }

  async getCardData(userWallet: JsonRpcSigner, campaign: StakingInterface) {
    //Get campaign data
    const { campaignAddress, campaignTokenAddress, rewardsAddresses } = campaign;

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
    const campaignData = await this.soloNonComp.getCampaignData(campaignAddress);

    // Get campaign state
    const state = await this.getState(campaignAddress);

    // Get user data
    const userData = await this.soloNonComp.getUserData(campaignAddress);

    const userAddress = await getAddressFromWallet(userWallet);
    const userWalletTokensBalanceBN = await getBalance(
      this.provider as Web3Provider,
      campaignTokenAddress,
      userAddress,
    );

    const {
      deltaDuration,
      deltaExpiration,
      campaignRewards: campaignRewardsBN,
      totalStaked: totalStakedBN,
      contractStakeLimit: contractStakeLimitBN,
      walletStakeLimit: walletStakeLimitBN,
      hasContractStakeLimit,
      hasWalletStakeLimit: hasUserStakeLimit,
      hasCampaignStarted,
      name,
    } = campaignData;

    if (!hasCampaignStarted) {
      return {};
    }

    const {
      exitTimestamp: exitTimestampBN,
      userRewards: userRewardsBN,
      userStakedAmount: userStakedAmountBN,
    } = userData;

    const userRewards = this._formatUserRewards(userRewardsBN);

    // Format values
    const [
      totalStaked,
      contractStakeLimit,
      walletStakeLimit,
      userStakedAmount,
      userWalletTokensBalance,
    ] = formatValuesToString([
      totalStakedBN,
      contractStakeLimitBN,
      walletStakeLimitBN,
      userStakedAmountBN,
      userWalletTokensBalanceBN,
    ]);

    // Format durations
    const { duration: durationMilliseconds, expirationTime } = this._formatDurationExpiration(
      deltaDuration.toNumber(),
      deltaExpiration.toNumber(),
    );

    const duration = formatStakingDuration(durationMilliseconds);

    // Format campaign rewards
    const {
      campaignRewardsTotal: totalRewards,
      campaignRewardsWeekly: weeklyRewards,
      campaignRewardsPerDayUSD,
    } = await this._formatCampaignRewards(1, campaignRewardsBN);

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

    // Calculate cooldown
    const cooldownPeriod = this._calculateCooldown(exitTimestampBN);

    //assuming we have only one reward
    const rewardTokenData = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.ADDRESS,
      rewardsAddresses[0],
    );
    const rewardToken = {
      symbol: rewardTokenData.symbol,
      address: rewardTokenData.address,
    };

    return {
      apy,
      autoCompounding: false,
      campaign: { ...campaign, name, isLpToken },
      contractStakeLimit,
      cooldownPeriod,
      emptyCardData: false,
      expirationTime,
      duration,
      hasContractStakeLimit,
      hasUserStakeLimit,
      pair,
      percentage,
      stakeLimit: walletStakeLimit,
      state,
      totalRewards,
      totalStaked,
      totalStakedUSD,
      userRewards,
      userStakedAmount,
      userWalletTokensBalance,
      weeklyRewards,
      rewardToken,
    };
  }

  async getEmptyCardData(campaign: StakingInterface) {
    //Get campaign data
    const { campaignAddress, campaignTokenAddress, rewardsAddresses } = campaign;

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

    let stakingToken: any = {};
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
    const campaignData = await this.soloNonComp.getCampaignData(campaignAddress);

    // Get campaign state
    const state = await this.getDisconnectedState(campaignAddress);

    const {
      deltaDuration,
      deltaExpiration,
      campaignRewards: campaignRewardsBN,
      totalStaked: totalStakedBN,
      contractStakeLimit: contractStakeLimitBN,
      walletStakeLimit: walletStakeLimitBN,
      hasContractStakeLimit,
      hasWalletStakeLimit: hasUserStakeLimit,
      hasCampaignStarted,
      name,
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

    const duration = formatStakingDuration(durationMilliseconds);

    // Format campaign rewards
    const {
      campaignRewardsTotal: totalRewards,
      campaignRewardsWeekly: weeklyRewards,
      campaignRewardsPerDayUSD,
    } = await this._formatCampaignRewards(1, campaignRewardsBN);

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

    //assuming we have only one reward
    const rewardTokenData = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.ADDRESS,
      rewardsAddresses[0],
    );
    const rewardToken = {
      symbol: rewardTokenData.symbol,
      address: rewardTokenData.address,
    };

    return {
      apy,
      autoCompounding: false,
      campaign: { ...campaign, name, isLpToken },
      contractStakeLimit,
      emptyCardData: true,
      expirationTime,
      duration,
      hasContractStakeLimit,
      hasUserStakeLimit,
      pair,
      percentage,
      stakeLimit: walletStakeLimit,
      state,
      totalRewards,
      totalStaked,
      totalStakedUSD,
      weeklyRewards,
      rewardToken,
    };
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
    result[pool] = await formatToken(this.provider as Web3Provider, totalSupply, poolAddress);

    for (let index = 0; index < tokenNames.length; index++) {
      const tokenName = tokenNames[index];
      const tokenAddress = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.SYMBOL,
        tokenName,
      ).address;

      result[tokenName] = await formatToken(
        this.provider as Web3Provider,
        reserves[index],
        tokenAddress,
      );
    }
    return result;
  }

  async _getTotalStakedUSD(
    poolAddress: string,
    provisionTokensAddresses: string[],
    totalStaked: number,
    poolContract: Contract,
  ) {
    // Get pool data
    const liquidityPoolSupply = await getTotalSupply(this.provider as Web3Provider, poolAddress);
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

  async _getPriceLpUSD(
    poolAddress: string,
    provisionTokensAddresses: string[],
    poolContract: Contract,
  ) {
    // Get pool data
    const liquidityPoolSupply = await getTotalSupply(this.provider as Web3Provider, poolAddress);
    const liquidityPoolSupplyFormated = Number(formatEther(liquidityPoolSupply.toString()));

    const reservesBalances = await this.getPoolReserveBalances(
      poolAddress,
      provisionTokensAddresses,
      poolContract,
    );

    const { symbol: symbol0, coinGeckoID: coinGeckoID0 } = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.ADDRESS,
      provisionTokensAddresses[0].toLowerCase(),
    );

    // Get reward price in USD from Coingecko
    const priceUSD0 = stableCoinsIds.includes(coinGeckoID0)
      ? 1
      : await this.coingecko.getTokenPrice(coinGeckoID0, 'usd');

    const amountUSD0 = priceUSD0 * reservesBalances[symbol0];

    const { symbol: symbol1, coinGeckoID: coinGeckoID1 } = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.ADDRESS,
      provisionTokensAddresses[1].toLowerCase(),
    );

    // Get reward price in USD from Coingecko
    const priceUSD1 = stableCoinsIds.includes(coinGeckoID1)
      ? 1
      : await this.coingecko.getTokenPrice(coinGeckoID1, 'usd');

    const amountUSD1 = priceUSD1 * reservesBalances[symbol1];

    return (amountUSD0 + amountUSD1) / liquidityPoolSupplyFormated;
  }

  async getState(stakerCampaignAddress: string): Promise<any> {
    const { hasCampaignStarted, hasCampaignEnded } = await this.soloNonComp.getCampaignStatusActive(
      stakerCampaignAddress,
    );

    const userData = await this.soloNonComp.getUserData(stakerCampaignAddress);

    const { exitTimestamp: exitTimestampBN, exitStake } = userData;

    // Calculate cooldown
    const now = Date.now();
    const nowInSeconds = now / 1000;
    const exitTimestampInSeconds = Number(exitTimestampBN.toString());

    if (!hasCampaignStarted) {
      return -1;
    }

    if (hasCampaignStarted && !hasCampaignEnded) {
      return 0;
    }

    if (exitTimestampInSeconds === 0) {
      return 1;
    }

    if (nowInSeconds <= exitTimestampInSeconds) {
      return 2;
    }

    if (nowInSeconds > exitTimestampInSeconds) {
      const exitStakeBN = exitStake as BigNumber;
      if (exitStakeBN.gt(0)) {
        return 3; // "StakingEnded/WithdrawTriggered/CooldownExpired/RewardNotClaimed"
      }

      return 4; //"StakingEnded/WithdrawTriggered/CooldownExpired/RewardClaimed"
    }
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

    // Adapter

    return rewards && rewards.length > 0
      ? {
          [rewards[0].tokenName]: rewards[0].tokenAmount,
        }
      : {};
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

  async _formatCampaignRewards(rewardsCount: number, campaignRewardsBN: CampaignRewards[]) {
    const secondsInDay = 86400;
    const secondsInWeek = 604800;
    const secondsInDayBN = BigNumber.from(secondsInDay);
    const secondsInWeekBN = BigNumber.from(secondsInWeek);

    const weekly = [];
    const total = [];
    let campaignRewardsPerDayUSD = 0;

    for (let i = 0; i < rewardsCount; i++) {
      const currentReward = campaignRewardsBN[i];
      const tokenAddress = currentReward.tokenAddress.toLowerCase();
      const {
        symbol: tokenName,
        coinGeckoID: tokenId,
        decimals: tokenDecimals,
      } = getTokenByPropName(this.tokenConfigs, TokenConfigsProps.ADDRESS, tokenAddress);

      const tokenAmountTotal = formatUnits(currentReward.totalRewards, tokenDecimals);
      const rewardPerSecond = currentReward.rewardPerSecond as BigNumber;
      const tokenAmountDaily = formatUnits(
        rewardPerSecond.mul(secondsInDayBN).toString(),
        tokenDecimals,
      );

      const tokenAmountWeekly = formatUnits(
        rewardPerSecond.mul(secondsInWeekBN).toString(),
        tokenDecimals,
      );

      total.push({
        tokenAddress,
        tokenAmount: tokenAmountTotal,
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
      const amountUSD = priceUSD * Number(tokenAmountDaily);
      campaignRewardsPerDayUSD = campaignRewardsPerDayUSD + amountUSD;
    }

    // Adapter for current reward format
    const campaignRewardsWeekly = {
      [weekly[0].tokenName]: weekly[0].tokenAmount,
    };

    const campaignRewardsTotal = {
      [total[0].tokenName]: total[0].tokenAmount,
    };

    return {
      campaignRewardsTotal,
      campaignRewardsWeekly,
      campaignRewardsPerDayUSD,
    };
  }

  _calculatePercentageLimit(totalStaked: number, contractStakeLimit: number) {
    const zeroBN = BigNumber.from(0);
    const totalStakedBigNumber = BigNumber.from(totalStaked);
    const contractStakeLimitBigNumber = BigNumber.from(contractStakeLimit);

    const percentageBigNumber =
      totalStakedBigNumber.gt(zeroBN) && contractStakeLimitBigNumber.gt(zeroBN)
        ? totalStakedBigNumber.div(contractStakeLimitBigNumber)
        : zeroBN;

    return Number(percentageBigNumber.toString()) * 100;
  }

  _calculateAPY_new(totalStakedUSD: number, campaignRewardsPerDayUSD: number) {
    return totalStakedUSD > 0 ? (campaignRewardsPerDayUSD / totalStakedUSD) * year * 100 : 0;
  }

  _calculateCooldown(exitTimestamp: BigNumber) {
    const now = Date.now();
    const nowInSeconds = now / 1000;
    const exitTimestampInSeconds = Number(exitTimestamp.toString());
    const deltaCooldown = exitTimestampInSeconds - nowInSeconds;
    return nowInSeconds + deltaCooldown;
  }

  async getDisconnectedState(campaignAddress: string): Promise<any> {
    const { hasCampaignStarted, hasCampaignEnded } = await this.soloNonComp.getCampaignStatus(
      campaignAddress,
    );

    if (!hasCampaignStarted) {
      return -1;
    }

    if (hasCampaignStarted && !hasCampaignEnded) {
      return 0;
    }
  }

  async getMigrationWhitelist(
    userWallet: Web3Provider,
    campaign: StakingInterface,
    campaignsArr: string[],
  ) {
    const { campaignAddress: stakerContractAddress } = campaign;
    const campaignInstance = new Contract(
      stakerContractAddress,
      NonCompoundingRewardsPoolABI,
      userWallet,
    );

    const whiteList = await Promise.all(
      campaignsArr.map(key => campaignInstance.receiversWhitelist(key)),
    );

    return campaignsArr.reduce((acc: string[], key: string, index: number) => {
      if (whiteList[index]) acc.push(key);
      return acc;
    }, []);
  }

  async migrateStake(userWallet: Web3Provider, transferFrom: string, transferTo: string) {
    const campaignInstance = new Contract(transferFrom, NonCompoundingRewardsPoolABI, userWallet);

    return campaignInstance.exitAndTransfer(transferTo);
  }

  async getUserStakedTokens(
    userWallet: JsonRpcSigner,
    stakerCampaignAddress: string,
    state: number,
  ) {
    const userAddress = await getAddressFromWallet(userWallet);

    const stakerCampaignInstance = new Contract(
      stakerCampaignAddress,
      NonCompoundingRewardsPoolABI,
      this.provider,
    );
    let userStakedTokens;
    if (state <= 1) {
      userStakedTokens = await stakerCampaignInstance.balanceOf(userAddress);
    } else {
      userStakedTokens = await this._getExitStake(userWallet, stakerCampaignInstance);
    }

    return userStakedTokens;
  }

  async _getExitStake(userWallet: JsonRpcSigner, stakerInstance: Contract) {
    const userAddress = await getAddressFromWallet(userWallet);
    const userExitInfo = await stakerInstance.exitInfo(userAddress);

    return userExitInfo.exitStake;
  }

  async getTotal(userWallet: Web3Provider, campaigns: StakingInterface[]) {
    const { getTokenPrice } = this.coingecko;

    const totalData = {
      tokenStakedInUSD: 0,
      totalRewardInUSD: 0,
    };

    for (const campaign of campaigns) {
      const { campaignTokenAddress, campaignAddress: stakerCampaignAddress } = campaign;

      const tokenLpInstance = new Contract(campaignTokenAddress, LpABI, this.provider);

      let isLpToken: boolean = false;
      let token0: string = '';
      let token1: string = '';

      try {
        token0 = await tokenLpInstance.token0();
        token1 = await tokenLpInstance.token1();

        isLpToken = true;
      } catch (error) {}

      let stakingToken: any;
      let campaignTokenPrice = 0;

      if (!isLpToken) {
        // Get staking & rewards token data
        stakingToken = getTokenByPropName(
          this.tokenConfigs,
          TokenConfigsProps.ADDRESS,
          campaignTokenAddress,
        );

        const { coinGeckoID } = stakingToken;
        campaignTokenPrice = await getTokenPrice(coinGeckoID, 'usd');
      } else {
        campaignTokenPrice = await this._getPriceLpUSD(
          campaignTokenAddress,
          [token0, token1],
          tokenLpInstance,
        );
      }

      const userData = await this.soloNonComp.getUserData(stakerCampaignAddress);

      const userStakedTokens = userData.userStakedAmount as BigNumber;
      const userRewards = userStakedTokens.gt(0)
        ? userData.userRewards[0].currentAmount
        : BigNumber.from(0);

      // Format tokens
      const userStakedTokensFormatted = await formatToken(
        userWallet,
        userStakedTokens,
        campaignTokenAddress,
      );

      const userRewardsFormatted = await formatToken(userWallet, userRewards, campaignTokenAddress);

      // Convert to USD
      const userStakedTokensUSD = Number(userStakedTokensFormatted) * campaignTokenPrice;
      const userRewardsUSD = Number(userRewardsFormatted) * campaignTokenPrice;

      totalData.tokenStakedInUSD = totalData.tokenStakedInUSD + userStakedTokensUSD;
      totalData.totalRewardInUSD = totalData.totalRewardInUSD + userRewardsUSD;
    }

    return totalData;
  }

  async getAllowance(userWallet: Web3Provider, campaign: StakingInterface) {
    const { campaignAddress: stakerContractAddress, campaignTokenAddress: stakeTokenAddress } =
      campaign;

    return getAllowance(userWallet, stakeTokenAddress, stakerContractAddress);
  }

  async approveToken(userWallet: Web3Provider, campaign: StakingInterface) {
    const { campaignAddress: stakerContractAddress, campaignTokenAddress: stakeTokenAddress } =
      campaign;

    return approveToken(userWallet, stakeTokenAddress, stakerContractAddress);
  }
}

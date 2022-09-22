import { FunctionFragment } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcBatchProvider, JsonRpcSigner, Web3Provider } from '@ethersproject/providers';
import { formatEther, formatUnits } from '@ethersproject/units';
import { BigNumber as BigNumberJS } from 'bignumber.js';

import {
  approveToken,
  BLOCKS_COUNT,
  CampaignRewardsNew,
  checkMaxStakingLimit,
  CoinGecko,
  convertBlockToSeconds,
  day,
  formatStakingDuration,
  formatToken,
  formatValuesToString,
  getAddressFromWallet,
  getAllowance,
  getBalance,
  getTokenByPropName,
  getTotalSupply,
  NetworkEnum,
  parseToken,
  poolTupleToString,
  Result,
  stableCoinsIds,
  StakerSolo,
  STAKING_CAMPAIGN_STATE,
  StakingInterface,
  TokenConfigs,
  TokenConfigsProps,
  UserRewards,
  year,
} from '..';
import LpABI from '../abi/AllianceBlockDexPoolABI.json';
import CompoundingPoolABI from '../abi/CompoundingRewardsPool.json';
import CompoundingRewardsPoolABI from '../abi/CompoundingRewardsPoolStaker.json';
import NonCompoundingRewardsPoolABI from '../abi/NonCompoundingRewardsPoolV1.json';

/**
 *  Represents a class that can interact with SoloStaker's campaigns
 *  depending on the network.
 *  @constructor
 *  @param {JsonRpcBatchProvider | Web3Provider} provider - Provider with the global interaction.
 *  @param {StakerSolo} soloNonComp - Class that helps with the actions of a SoloStaker campaign.
 *  @param {CoinGecko} coingecko - Class for fetching the balance of the CoinGecko API.
 *  @param {TokenConfigs} tokenConfigs - Tokens that are inside of the JSON config configuration.
 *  @param {NetworkEnum} protocol - Name of the network where this class is being used.
 */
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

  stake(userWallet: JsonRpcSigner, campaign: StakingInterface, amountToStake: string) {
    const { campaignAddress, version = '1.0' } = campaign;

    if (version === '1.0') {
      return this._stake(userWallet, campaign, amountToStake);
    }

    return this.soloNonComp.stake(campaignAddress, amountToStake, false);
  }

  async _stake(
    userWallet: JsonRpcSigner,
    campaign: StakingInterface,
    stakeTokenAmountIn: string,
  ): Promise<FunctionFragment> {
    const {
      campaignAddress: stakerContractAddress,
      campaignTokenAddress: stakeTokenAddress,
      compounding,
    } = campaign;

    const poolContract = new Contract(
      stakerContractAddress,
      compounding ? CompoundingRewardsPoolABI : NonCompoundingRewardsPoolABI,
      userWallet,
    );

    const stakeTokenAmountInBN = await parseToken(
      this.provider as Web3Provider,
      stakeTokenAmountIn,
      stakeTokenAddress,
    );

    return poolContract.stake(stakeTokenAmountInBN);
  }

  exit(userWallet: JsonRpcSigner, campaign: StakingInterface) {
    const { campaignAddress, version = '1.0' } = campaign;

    if (version === '1.0') {
      return this._exit(userWallet, campaign);
    }

    return this.soloNonComp.exit(campaignAddress);
  }

  async _exit(userWallet: JsonRpcSigner, campaign: StakingInterface) {
    const { campaignAddress: stakerContractAddress, compounding } = campaign;
    const stakerInstance = new Contract(
      stakerContractAddress,
      compounding ? CompoundingRewardsPoolABI : NonCompoundingRewardsPoolABI,
      userWallet,
    );

    return stakerInstance.exit();
  }

  completeExit(userWallet: JsonRpcSigner, campaign: StakingInterface) {
    const { campaignAddress, version = '1.0' } = campaign;

    if (version === '1.0') {
      return this._completeExit(userWallet, campaign);
    }

    return this.soloNonComp.completeExit(campaignAddress);
  }

  async _completeExit(userWallet: JsonRpcSigner, campaign: StakingInterface) {
    const { campaignAddress: stakerContractAddress, compounding } = campaign;
    const stakerInstance = new Contract(
      stakerContractAddress,
      compounding ? CompoundingRewardsPoolABI : NonCompoundingRewardsPoolABI,
      userWallet,
    );

    return stakerInstance.completeExit();
  }

  async getCardDataCommon(userWallet: JsonRpcSigner, campaign: StakingInterface) {
    const { version } = campaign;

    interface VersionMapping {
      [key: string]: 'getCardData' | 'getCardDataNew';
    }

    const versionMapping: VersionMapping = {
      '1.0': 'getCardData',
      '2.0': 'getCardDataNew',
      '3.0': 'getCardDataNew',
    };

    // Compose function name based on version
    const cardDataMethod = `${versionMapping[version]}`;

    return this[cardDataMethod](userWallet, campaign);
  }

  async getCardData(userWallet: JsonRpcSigner, campaign: StakingInterface) {
    const userAddress = await getAddressFromWallet(userWallet);

    // Get campaign data
    const {
      campaignAddress: stakerCampaignAddress,
      campaignTokenAddress,
      compounding,
      rewardsAddresses,
    } = campaign;

    // Get tokens data
    const stakingToken = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.ADDRESS,
      campaignTokenAddress,
    );

    const { coinGeckoID: stakingTokenId, symbol } = stakingToken;

    // Get staker campaign instance
    const stakerCampaignInstance = new Contract(
      stakerCampaignAddress,
      compounding ? CompoundingRewardsPoolABI : NonCompoundingRewardsPoolABI,
      userWallet,
    );
    // Get contracts data
    let totalStaked = compounding
      ? stakerCampaignInstance.totalAmountStaked()
      : stakerCampaignInstance.totalStaked();
    let stakeLimit = stakerCampaignInstance.stakeLimit();
    let contractStakeLimit = stakerCampaignInstance.contractStakeLimit();
    let rAndD, apy, campaignInstance;
    if (compounding) {
      // Get campaign instance
      const campaignAddress = await stakerCampaignInstance.rewardPool();
      campaignInstance = new Contract(campaignAddress, CompoundingPoolABI, userWallet);
      rAndD = this._getRewardsAndDurations(campaignInstance);
      apy = this._calculateAPY(stakerCampaignInstance, compounding, campaignInstance);
    } else {
      rAndD = this._getRewardsAndDurations(stakerCampaignInstance);
      apy = this._calculateAPY(stakerCampaignInstance, compounding);
    }

    let cooldownPeriod = this._getCoolDownPeriod(userWallet, stakerCampaignInstance);
    const state = this.getState(userWallet, stakerCampaignAddress, compounding);

    let stakingTokenPrice = this.coingecko.getTokenPrice(stakingTokenId, 'usd');
    let userBalance = getBalance(this.provider as Web3Provider, campaignTokenAddress, userAddress);

    const result: Result = await Promise.all([
      rAndD,
      apy,
      totalStaked,
      contractStakeLimit,
      stakeLimit,
      stakingTokenPrice,
      userBalance,
      cooldownPeriod,
      state,
    ]);

    const {
      duration: durationMilliseconds,
      expirationTime,
      totalRewards,
      weeklyRewards,
    } = result[0];
    totalStaked = result[2];
    contractStakeLimit = result[3];
    stakeLimit = result[4];
    stakingTokenPrice = result[5];
    userBalance = result[6];
    cooldownPeriod = result[7];
    const stateResult = result[8];
    apy =
      stateResult != STAKING_CAMPAIGN_STATE.STAKING_IN_PROGRESS &&
      stateResult != STAKING_CAMPAIGN_STATE.NOT_STARTED
        ? 0
        : result[1];

    const duration = formatStakingDuration(durationMilliseconds);

    const userRewards =
      stateResult <= 1
        ? await this._getAllUserAccumulatedRewards(
            userWallet,
            stakerCampaignInstance,
            compounding,
            campaignInstance,
          )
        : compounding && campaignInstance
        ? this._getAllPendingRewardsAuto(userWallet, stakerCampaignInstance, campaignInstance)
        : await this._getAllPendingRewards(stakerCampaignInstance);

    const userStakedTokens = await this.getUserStakedTokens(
      userWallet,
      stakerCampaignAddress,
      stateResult,
      compounding,
    );

    // Check limits
    const hasContractStakeLimit = !checkMaxStakingLimit(contractStakeLimit);
    const hasUserStakeLimit = !checkMaxStakingLimit(stakeLimit);

    // format tokens
    const userStakedAmount = await formatToken(
      this.provider as Web3Provider,
      userStakedTokens,
      campaignTokenAddress,
    );

    totalStaked = await formatToken(
      this.provider as Web3Provider,
      totalStaked,
      campaignTokenAddress,
    );

    const userWalletTokensBalance = await formatToken(
      this.provider as Web3Provider,
      userBalance,
      campaignTokenAddress,
    );

    contractStakeLimit = await formatToken(
      this.provider as Web3Provider,
      contractStakeLimit,
      campaignTokenAddress,
    );
    stakeLimit = await formatToken(this.provider as Web3Provider, stakeLimit, campaignTokenAddress);

    const totalStakedBN = BigNumber.from(parseInt(totalStaked));
    const contractStakeLimitBN = BigNumber.from(parseInt(contractStakeLimit));
    const zeroBN = BigNumber.from(0);

    const percentageBN =
      totalStakedBN.gt(zeroBN) && contractStakeLimitBN.gt(zeroBN)
        ? totalStakedBN.div(contractStakeLimitBN)
        : zeroBN;

    const percentage = Number(percentageBN.toString()) * 100;

    const totalStakedUSD = String(Number(totalStakedBN) * Number(stakingTokenPrice));

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
      autoCompounding: compounding,
      campaign,
      contractStakeLimit,
      cooldownPeriod,
      emptyCardData: false,
      expirationTime,
      duration,
      hasContractStakeLimit,
      hasUserStakeLimit,
      pair,
      percentage,
      stakeLimit,
      state: stateResult,
      totalStaked,
      totalStakedUSD,
      userRewards,
      userStakedAmount,
      userWalletTokensBalance,
      totalRewards,
      weeklyRewards,
      rewardToken,
    };
  }

  async getCardDataNew(userWallet: JsonRpcSigner, campaign: StakingInterface) {
    //Get campaign data
    const { campaignAddress, campaignTokenAddress, rewardsAddresses, version } = campaign;

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
    const state = await this.getState(userWallet, campaignAddress, false, version);

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

  async getEmptyCardDataCommon(campaign: StakingInterface) {
    const { version } = campaign;

    interface VersionMapping {
      [key: string]: 'getEmptyCardData' | 'getEmptyCardDataNew';
    }

    const versionMapping: VersionMapping = {
      '1.0': 'getEmptyCardData',
      '2.0': 'getEmptyCardDataNew',
      '3.0': 'getEmptyCardDataNew',
    };

    // Compose function name based on version
    const cardDataMethod = `${versionMapping[version]}`;

    return this[cardDataMethod](campaign);
  }

  async getEmptyCardData(campaign: StakingInterface) {
    // Get campaign data
    const {
      campaignAddress: stakerCampaignAddress,
      campaignTokenAddress,
      compounding,
      rewardsAddresses,
    } = campaign;

    // Get tokens data
    const stakingToken = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.ADDRESS,
      campaignTokenAddress,
    );
    const { coinGeckoID: stakingTokenId, symbol } = stakingToken;

    // Get staker campaign instance
    const stakerCampaignInstance = new Contract(
      stakerCampaignAddress,
      compounding ? CompoundingRewardsPoolABI : NonCompoundingRewardsPoolABI,
      this.provider,
    );

    let rAndD, apy, campaignInstance;
    if (compounding) {
      // Get campaign instance
      const campaignAddress = await stakerCampaignInstance.rewardPool();
      campaignInstance = new Contract(campaignAddress, CompoundingPoolABI, this.provider);
      rAndD = this._getRewardsAndDurations(campaignInstance);
      apy = this._calculateAPY(stakerCampaignInstance, compounding, campaignInstance);
    } else {
      rAndD = this._getRewardsAndDurations(stakerCampaignInstance);
      apy = this._calculateAPY(stakerCampaignInstance, compounding);
    }

    let totalStaked = compounding
      ? stakerCampaignInstance.totalAmountStaked()
      : stakerCampaignInstance.totalStaked();

    let contractStakeLimit = stakerCampaignInstance.contractStakeLimit();
    let stakeLimit = stakerCampaignInstance.stakeLimit();

    let stakingTokenPrice = this.coingecko.getTokenPrice(stakingTokenId, 'usd');

    // Get state
    const state = this.getDisconnectedState(stakerCampaignAddress);

    const result = await Promise.all([
      rAndD,
      apy,
      totalStaked,
      stakingTokenPrice,
      contractStakeLimit,
      stakeLimit,
      state,
    ]);

    const {
      duration: durationMilliseconds,
      expirationTime,
      totalRewards,
      weeklyRewards,
    } = result[0];
    apy = result[1];
    totalStaked = result[2];
    stakingTokenPrice = result[3];
    contractStakeLimit = result[4];
    stakeLimit = result[5];
    const stateResult = result[6];

    const duration = formatStakingDuration(durationMilliseconds);

    // Check limits
    const hasContractStakeLimit = !checkMaxStakingLimit(contractStakeLimit);
    const hasUserStakeLimit = !checkMaxStakingLimit(stakeLimit);

    // format tokens
    totalStaked = await formatToken(
      this.provider as Web3Provider,
      totalStaked,
      campaignTokenAddress,
    );
    contractStakeLimit = await formatToken(
      this.provider as Web3Provider,
      contractStakeLimit,
      campaignTokenAddress,
    );
    stakeLimit = await formatToken(this.provider as Web3Provider, stakeLimit, campaignTokenAddress);

    const totalStakedBN = BigNumber.from(totalStaked);
    const stakingTokenPriceBN = BigNumber.from(stakingTokenPrice);
    const contractStakeLimitBN = BigNumber.from(contractStakeLimit);
    const zeroBN = BigNumber.from('0');

    const percentageBN =
      totalStakedBN.gt(zeroBN) && contractStakeLimitBN.gt(zeroBN)
        ? totalStakedBN.div(contractStakeLimitBN)
        : zeroBN;

    const percentage = Number(percentageBN.toString()) * 100;

    const totalStakedUSD = totalStakedBN.mul(stakingTokenPriceBN).toString();

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
      autoCompounding: compounding,
      campaign,
      contractStakeLimit,
      emptyCardData: true,
      expirationTime,
      duration,
      hasContractStakeLimit,
      hasUserStakeLimit,
      pair,
      percentage,
      stakeLimit,
      state: stateResult,
      totalStaked,
      totalStakedUSD,
      totalRewards,
      weeklyRewards,
      rewardToken,
    };
  }

  async getEmptyCardDataNew(campaign: StakingInterface) {
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

  async _getRewardsAndDurations(campaignInstance: Contract) {
    const { getRewardTokensCount, rewardsTokens, rewardPerBlock } = campaignInstance;

    let currentBlock: any = this.provider.getBlock('latest');
    let startBlock = campaignInstance.startBlock();
    let endBlock = campaignInstance.endBlock();

    const result: { [key: string]: any } = await Promise.all([currentBlock, startBlock, endBlock]);
    currentBlock = result[0];
    startBlock = result[1];
    endBlock = result[2];

    const durationInBlocks = endBlock.sub(startBlock);
    const exp = endBlock.sub(currentBlock.number);
    const expirationInBlocks = exp.gt(0) ? exp : BigNumber.from(0);

    const totalRewards: { [key: string]: any } = {};
    const weeklyRewards: { [key: string]: any } = {};

    const rewardsCount = await getRewardTokensCount();

    for (let i = 0; i < rewardsCount; i++) {
      const rewardTokenAddress = await rewardsTokens(i);
      const rewardAmountPerBlock = await rewardPerBlock(i);

      const rewardTokenName = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        rewardTokenAddress.toLowerCase(),
      ).symbol;

      const totalRewardAmount = await formatToken(
        this.provider as Web3Provider,
        rewardAmountPerBlock.mul(durationInBlocks).toString(),
        rewardTokenAddress,
      );

      totalRewards[rewardTokenName] = totalRewardAmount;

      const weeklyRewardAmount = await formatToken(
        this.provider as Web3Provider,
        rewardAmountPerBlock.mul(BLOCKS_COUNT[this.protocol].PER_WEEK),
        rewardTokenAddress,
      );

      weeklyRewards[rewardTokenName] = weeklyRewardAmount;
    }

    // Time
    const expirationTimeInSeconds = convertBlockToSeconds(expirationInBlocks, this.protocol);
    const expirationTimeInMilliseconds = expirationTimeInSeconds.mul(1000).toNumber();

    const durationPeriodInSeconds = convertBlockToSeconds(durationInBlocks, this.protocol);
    const durationPeriodInMilliseconds = durationPeriodInSeconds.mul(1000).toNumber();

    return {
      duration: durationPeriodInMilliseconds,
      expirationTime: expirationTimeInMilliseconds,
      totalRewards,
      weeklyRewards,
    };
  }

  async _calculateAPY(stakerInstance: Contract, compounding: boolean, campaignInstance?: Contract) {
    const { getRewardTokensCount, rewardsTokens, rewardPerBlock } =
      compounding && campaignInstance ? campaignInstance : stakerInstance;

    let totalStaked, stakingToken, startBlock, endBlock;
    stakingToken = stakerInstance.stakingToken();

    if (compounding && campaignInstance) {
      totalStaked = campaignInstance.totalStaked();

      startBlock = campaignInstance.startBlock();
      endBlock = campaignInstance.endBlock();
    } else {
      totalStaked = stakerInstance.totalStaked();

      startBlock = stakerInstance.startBlock();
      endBlock = stakerInstance.endBlock();
    }

    const result = await Promise.all([totalStaked, stakingToken, startBlock, endBlock]);

    let totalRewardPerBlockInUSD = 0;
    const rewardsCount = await getRewardTokensCount();

    for (let i = 0; i < rewardsCount; i++) {
      const rewardTokenAddress = await rewardsTokens(i);
      let rewardAmountPerBlock = await rewardPerBlock(i);
      const rewardToken = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        rewardTokenAddress.toLowerCase(),
      );

      rewardAmountPerBlock = await formatToken(
        this.provider as Web3Provider,
        rewardAmountPerBlock,
        rewardTokenAddress,
      );

      // PRICE
      const tokenId = rewardToken.coinGeckoID;
      const priceInUSD = await this.coingecko.getTokenPrice(tokenId, 'usd');

      // CALCULATE
      const rewardAmountInUSD = Number(rewardAmountPerBlock) * priceInUSD;
      totalRewardPerBlockInUSD += rewardAmountInUSD;
    }

    stakingToken = result[1];
    totalStaked = await formatToken(this.provider as Web3Provider, result[0], stakingToken);
    startBlock = result[2];
    endBlock = result[3];

    // total rewards in USD
    const durationInBlocks = BigNumber.from(endBlock.sub(startBlock).toString());
    const totalRewardsInUSD = totalRewardPerBlockInUSD * durationInBlocks.toNumber();

    // total staked in USD
    const tokenId = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.ADDRESS,
      stakingToken.toLowerCase(),
    ).coinGeckoID;
    const priceInUSD = await this.coingecko.getTokenPrice(tokenId, 'usd');
    const totalStakedInUSD = Number(totalStaked) * priceInUSD;

    // TPY
    let tpy = 0;

    if (totalStakedInUSD !== 0) {
      tpy = totalRewardsInUSD / totalStakedInUSD;
    }

    // time of lock up estimation
    const seconds = await convertBlockToSeconds(endBlock.sub(startBlock), this.protocol);
    const days = Math.floor(seconds.div(day).toNumber());

    // APY
    let apy = 0;

    if (days !== 0) {
      apy = tpy / (days / year);
    }

    return apy * 100;
  }

  async _getCoolDownPeriod(userWallet: JsonRpcSigner, campaignInstance: Contract) {
    const currentBlock = await this.provider.getBlock('latest');
    const currentBlockBN = BigNumber.from(currentBlock.number);
    const userAddress = await getAddressFromWallet(userWallet);

    const userExitInfo = await campaignInstance.exitInfo(userAddress);
    const cdBlocks = userExitInfo.exitBlock.sub(currentBlockBN);
    const userCooldownBlocks = cdBlocks.gt(0) ? cdBlocks : BigNumber.from(0);

    const coolDownSeconds = await convertBlockToSeconds(userCooldownBlocks, this.protocol);
    const coolDown = coolDownSeconds.add(currentBlock.timestamp);

    return Number(coolDown.toString());
  }

  async getState(
    userWallet: JsonRpcSigner,
    stakerCampaignAddress: string,
    compounding: boolean,
    version = '1.0',
  ): Promise<any> {
    if (version === '1.0') {
      let currentBlock: any = this.provider.getBlock('latest');
      const userAddress = await getAddressFromWallet(userWallet);

      const stakerInstance = new Contract(
        stakerCampaignAddress,
        compounding ? CompoundingRewardsPoolABI : NonCompoundingRewardsPoolABI,
        userWallet,
      );

      let startBlock, endBlock;

      let userExitInfo = stakerInstance.exitInfo(userAddress);
      if (compounding) {
        const campaignAddress = await stakerInstance.rewardPool();
        const campaignInstance = new Contract(campaignAddress, CompoundingPoolABI, this.provider);

        startBlock = campaignInstance.startBlock();
        endBlock = campaignInstance.endBlock();
      } else {
        startBlock = stakerInstance.startBlock();
        endBlock = stakerInstance.endBlock();
      }

      const result = await Promise.all([currentBlock, startBlock, endBlock, userExitInfo]);
      currentBlock = BigNumber.from(result[0].number);
      startBlock = result[1];
      endBlock = result[2];
      userExitInfo = result[3];

      if (currentBlock.lt(startBlock)) {
        return -1; // "StakingHasNotStartedYet"
      }

      if (currentBlock.lt(endBlock)) {
        return 0; // "StakingInProgress"
      }

      if (userExitInfo.exitBlock.eq(0)) {
        return 1; // "StakingEnded/NoWithdrawTriggered"
      }

      if (currentBlock.lte(userExitInfo.exitBlock)) {
        return 2; // "StakingEnded/WithdrawTriggered/InCooldown"
      }

      if (currentBlock.gt(userExitInfo.exitBlock)) {
        if (userExitInfo.exitStake.gt(0)) {
          return 3; // "StakingEnded/WithdrawTriggered/CooldownExpired/RewardNotClaimed"
        }

        return 4; //"StakingEnded/WithdrawTriggered/CooldownExpired/RewardClaimed"
      }
    } else {
      const { hasCampaignStarted, hasCampaignEnded } =
        await this.soloNonComp.getCampaignStatusActive(stakerCampaignAddress);

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
  }

  async _getAllUserAccumulatedRewards(
    userWallet: JsonRpcSigner,
    stakerInstance: Contract,
    compounding: boolean,
    campaignInstance: Contract | undefined,
  ) {
    const { balanceOf } = stakerInstance;
    let getRewardTokensCount, rewardsTokens;
    if (compounding && campaignInstance) {
      getRewardTokensCount = campaignInstance.getRewardTokensCount;
      rewardsTokens = campaignInstance.rewardsTokens;
    } else {
      getRewardTokensCount = stakerInstance.getRewardTokensCount;
      rewardsTokens = stakerInstance.rewardsTokens;
    }

    const userAddress = await getAddressFromWallet(userWallet);

    const stakedTokens = await balanceOf(userAddress);
    const hasUserStaked = stakedTokens.gt(0);

    const userRewards: { [key: string]: any } = {};
    const rewardsCount = await getRewardTokensCount();

    for (let i = 0; i < rewardsCount; i++) {
      const rewardTokenAddress = await rewardsTokens(i);
      const rewardTokenName = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        rewardTokenAddress.toLowerCase(),
      ).symbol;

      let reward: BigNumber | string = BigNumber.from(0);

      if (hasUserStaked) {
        reward = compounding
          ? await stakerInstance.getUserAccumulatedRewards(userAddress)
          : await stakerInstance.getUserAccumulatedReward(userAddress, 0);
        reward = await formatToken(this.provider as Web3Provider, reward, rewardTokenAddress);
      }

      userRewards[rewardTokenName] = reward.toString();
    }

    return userRewards;
  }

  async _getAllPendingRewards(campaignInstance: Contract) {
    const { getRewardTokensCount, rewardsTokens, getPendingReward } = campaignInstance;

    const rewardsCount = await getRewardTokensCount();
    const pendingRewards: { [key: string]: any } = {};

    for (let i = 0; i < rewardsCount; i++) {
      const rewardTokenAddress = await rewardsTokens(i);
      const rewardTokenName = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        rewardTokenAddress.toLowerCase(),
      ).symbol;

      let rewardTokenAmount = await getPendingReward(i);

      rewardTokenAmount = await formatToken(
        this.provider as Web3Provider,
        rewardTokenAmount,
        rewardTokenAddress,
      );

      pendingRewards[rewardTokenName] = rewardTokenAmount.toString();
    }

    return pendingRewards;
  }

  async _getAllPendingRewardsAuto(
    userWallet: JsonRpcSigner,
    stakerInstance: Contract,
    campaignInstance: Contract,
  ) {
    const { rewardsTokens } = campaignInstance;
    const pendingRewards: { [key: string]: any } = {};
    const userAddress = await getAddressFromWallet(userWallet);
    const currentRewards = await stakerInstance.getUserAccumulatedRewards(userAddress);
    const rewardTokenAddress = await rewardsTokens(0);
    const rewardTokenName = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.ADDRESS,
      rewardTokenAddress.toLowerCase(),
    ).symbol;
    pendingRewards[rewardTokenName] = currentRewards.toString();

    return pendingRewards;
  }

  async getUserStakedTokens(
    userWallet: JsonRpcSigner,
    stakerCampaignAddress: string,
    state: number,
    compounding: boolean,
  ) {
    const userAddress = await getAddressFromWallet(userWallet);

    const stakerCampaignInstance = new Contract(
      stakerCampaignAddress,
      compounding ? CompoundingRewardsPoolABI : NonCompoundingRewardsPoolABI,
      this.provider,
    );
    let userStakedTokens;
    if (state <= 1) {
      if (compounding) {
        // Get campaign instance
        const campaignAddress = await stakerCampaignInstance.rewardPool();
        const campaignInstance = new Contract(campaignAddress, CompoundingPoolABI, userWallet);
        userStakedTokens = await this._getStakedCompoundedTokens(
          userWallet,
          stakerCampaignInstance,
          campaignInstance,
        );
      } else {
        userStakedTokens = await stakerCampaignInstance.balanceOf(userAddress);
      }
    } else {
      userStakedTokens = await this._getExitStake(userWallet, stakerCampaignInstance);
    }

    return userStakedTokens;
  }

  async _getStakedCompoundedTokens(
    userWallet: JsonRpcSigner,
    stakerInstance: Contract,
    campaignInstance: Contract,
  ) {
    // Some BN numbers
    const zeroBN = BigNumber.from(0);
    const tenBN = BigNumber.from(10);
    const unit = tenBN.pow(18);

    const userAddress = await getAddressFromWallet(userWallet);

    const promiseArray = [
      stakerInstance.exitStake(),
      stakerInstance.totalShares(),
      stakerInstance.share(userAddress),
      campaignInstance.totalStaked(),
    ];

    const [exitStake, totalShares, userShare, totalStakedInPool] = await Promise.all(promiseArray);

    if (totalStakedInPool.eq(zeroBN) || totalShares.eq(zeroBN)) {
      return zeroBN;
    }

    // Get accumulated rewards (assuming there is only one reward token)
    const accumulatedRewards = await campaignInstance.getUserAccumulatedReward(
      stakerInstance.address,
      0,
    );

    // Calculate total pool value based on total staked + accumulated rewards
    const poolTotalTokens = totalStakedInPool.add(accumulatedRewards).sub(exitStake);

    // Calculate value per share
    const valuePerShare = poolTotalTokens.mul(unit).div(totalShares);

    // Calculate total user value
    return valuePerShare.mul(userShare).div(unit);
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

  async _formatCampaignRewards(rewardsCount: number, campaignRewardsBN: CampaignRewardsNew[]) {
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

  _calculateCooldown(exitTimestamp: BigNumber) {
    const now = Date.now();
    const nowInSeconds = now / 1000;
    const exitTimestampInSeconds = Number(exitTimestamp.toString());
    const deltaCooldown = exitTimestampInSeconds - nowInSeconds;
    return nowInSeconds + deltaCooldown;
  }

  async getDisconnectedState(campaignAddress: string, version = '1.0'): Promise<any> {
    if (version === '1.0') {
      const campaignInstance = new Contract(
        campaignAddress,
        NonCompoundingRewardsPoolABI,
        this.provider,
      );

      const promisesArray = [
        this.provider.getBlock('latest'),
        campaignInstance.startBlock(),
        campaignInstance.endBlock(),
      ];

      const [currentBlock, startBlock, endBlock] = await Promise.all(promisesArray);

      const currentBlockBN = BigNumber.from(currentBlock.number);

      if (currentBlockBN.lt(startBlock)) {
        return -1; // "StakingHasNotStartedYet"
      }

      if (currentBlockBN.lt(endBlock)) {
        return 0; // "StakingInProgress"
      }
    } else {
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
  }

  async getMigrationWhitelist(
    userWallet: JsonRpcSigner,
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

  async migrateStake(userWallet: JsonRpcSigner, transferFrom: string, transferTo: string) {
    const campaignInstance = new Contract(transferFrom, NonCompoundingRewardsPoolABI, userWallet);

    return campaignInstance.exitAndTransfer(transferTo);
  }

  async getTotal(userWallet: JsonRpcSigner, campaigns: StakingInterface[]) {
    const { getTokenPrice } = this.coingecko;

    const userAddress = await getAddressFromWallet(userWallet);

    const totalData = {
      tokenStakedInUSD: 0,
      totalRewardInUSD: 0,
    };

    for (const campaign of campaigns) {
      const {
        campaignTokenAddress,
        campaignAddress: stakerCampaignAddress,
        version,
        compounding,
      } = campaign;

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

      // Get staker campaign instance
      const stakerCampaignInstance = new Contract(
        stakerCampaignAddress,
        compounding ? CompoundingRewardsPoolABI : NonCompoundingRewardsPoolABI,
        userWallet,
      );

      const { balanceOf, getUserAccumulatedReward, exitInfo, getPendingReward } =
        stakerCampaignInstance;

      // Get state
      const state = await this.getState(userWallet, stakerCampaignAddress, compounding, version);

      let userStakedTokens;
      let userRewards;

      if (version === '1.0') {
        // Get staked tokens
        if ((state as number) <= 1) {
          if (compounding) {
            // Get campaign instance
            const campaignAddress = await stakerCampaignInstance.rewardPool();
            const campaignInstance = new Contract(campaignAddress, CompoundingPoolABI, userWallet);
            userStakedTokens = await stakerCampaignInstance.userStakedAmount(userAddress);

            const userCompoundedTokens = await this._getStakedCompoundedTokens(
              userWallet,
              stakerCampaignInstance,
              campaignInstance,
            );

            userRewards = userCompoundedTokens.sub(userStakedTokens);
          } else {
            userStakedTokens = await balanceOf(userAddress);
            userRewards = userStakedTokens.gt(0)
              ? await getUserAccumulatedReward(userAddress, 0)
              : BigNumber.from(0);
          }
        } else {
          if (compounding) {
            userStakedTokens = BigNumber.from(0);
            // Can not extract initial staking amount, so it will be shown along with rewards
            const userExitInfo = await stakerCampaignInstance.exitInfo(userAddress);
            userRewards = userExitInfo.exitStake;
          } else {
            const userExitInfo = await exitInfo(userAddress);
            userStakedTokens = userExitInfo.exitStake;
            userRewards = await getPendingReward(0);
          }
        }
      } else {
        const userData = await this.soloNonComp.getUserData(stakerCampaignAddress);

        userStakedTokens = userData.userStakedAmount as BigNumber;
        userRewards = userStakedTokens.gt(0)
          ? userData.userRewards[0].currentAmount
          : BigNumber.from(0);
      }

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

  async _getExitStake(userWallet: JsonRpcSigner, stakerInstance: Contract) {
    const userAddress = await getAddressFromWallet(userWallet);
    const userExitInfo = await stakerInstance.exitInfo(userAddress);

    return userExitInfo.exitStake;
  }

  async getAllowance(userWallet: JsonRpcSigner, campaign: StakingInterface) {
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

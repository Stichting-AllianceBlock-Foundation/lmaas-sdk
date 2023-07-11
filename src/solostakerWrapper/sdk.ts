import { formatEther, formatUnits, getContract, parseAbi, PublicClient, WalletClient } from 'viem';

import {
  approveToken,
  BLOCKS_COUNT,
  CampaignRewardsNew,
  checkMaxStakingLimit,
  CoinGecko,
  convertBlockToSeconds,
  day,
  dexByNetworkMapping,
  formatStakingDuration,
  formatToken,
  formatValuesToString,
  getAddressFromWallet,
  getAllowance,
  getBalance,
  getTokenByPropName,
  getTokenDecimals,
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
import { LiquidityProviderABI } from '../abi/AllianceBlockDexPoolABI';
import { CompoundingRewardsPoolStakerABI } from '../abi/CompoundingRewardsPoolStaker';
import { NonCompoundingRewardsPoolABI } from '../abi/NonCompoundingRewardsPoolV1';

const parsedAbi = parseAbi([
  'function getRewardTokensCount() view returns (uint256)',
  'function rewardsTokens(uint256) view returns (address)',
  'function rewardPerBlock(uint256) view returns (uint256)',
  'function startBlock() view returns (uint256)',
  'function endBlock() view returns (uint256)',
  'function totalStaked() view returns (uint256)',
  'function stakingToken() view returns (address)',
  'function exitInfo(address) view returns (uint256,uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function getUserAccumulatedReward(address,uint256) view returns (uint256)',
  'function userStakedAmount(address) view returns (uint256)',
  'function exitStake() view returns (uint256)',
  'function totalShares() view returns (uint256)',
  'function share(address) view returns (uint256)',
  'function getPendingReward(uint256) view returns (uint256)',
]);

/**
 *  Represents a class that can interact with SoloStaker's campaigns
 *  depending on the network.
 *  @constructor
 *  @param {PublicClient} provider - Provider with the global interaction.
 *  @param {StakerSolo} soloNonComp - Class that helps with the actions of a SoloStaker campaign.
 *  @param {CoinGecko} coingecko - Class for fetching the balance of the CoinGecko API.
 *  @param {TokenConfigs} tokenConfigs - Tokens that are inside of the JSON config configuration.
 *  @param {NetworkEnum} protocol - Name of the network where this class is being used.
 */
export class SoloStakerWrapper {
  provider: PublicClient;
  soloNonComp: StakerSolo;
  coingecko: CoinGecko;
  tokenConfigs: TokenConfigs;
  protocol: NetworkEnum;
  [key: string]: any;

  constructor(
    provider: PublicClient,
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

  stake(
    wallet: WalletClient,
    campaign: StakingInterface,
    amountToStake: string,
    isNativeSupported = false,
  ) {
    const { campaignAddress, version = '1.0' } = campaign;

    if (version === '1.0') {
      return this._stake(wallet, campaign, amountToStake);
    }

    return this.soloNonComp.stake(campaignAddress, amountToStake, wallet, isNativeSupported);
  }

  async _stake(
    wallet: WalletClient,
    campaign: StakingInterface,
    stakeTokenAmountIn: string,
  ): Promise<`0x${string}`> {
    const {
      campaignAddress: stakerContractAddress,
      campaignTokenAddress: stakeTokenAddress,
      compounding,
    } = campaign;

    const stakeTokenAmountInBN = await parseToken(
      this.provider,
      stakeTokenAmountIn,
      stakeTokenAddress as `0x${string}`,
    );

    if (compounding) {
      const { request } = await this.provider.simulateContract({
        abi: CompoundingRewardsPoolStakerABI,
        address: stakerContractAddress as `0x${string}`,
        functionName: 'stake',
        args: [stakeTokenAmountInBN],
      });

      return await wallet.writeContract(request);
    }

    const { request } = await this.provider.simulateContract({
      abi: NonCompoundingRewardsPoolABI,
      address: stakerContractAddress as `0x${string}`,
      functionName: 'stake',
      args: [stakeTokenAmountInBN],
    });

    return await wallet.writeContract(request);
  }

  exit(wallet: WalletClient, campaign: StakingInterface) {
    const { campaignAddress, version = '1.0' } = campaign;

    if (version === '1.0') {
      return this._exit(wallet, campaign);
    }

    return this.soloNonComp.exit(campaignAddress, wallet);
  }

  async _exit(wallet: WalletClient, campaign: StakingInterface) {
    const { campaignAddress: stakerContractAddress, compounding } = campaign;
    if (compounding) {
      const { request } = await this.provider.simulateContract({
        abi: CompoundingRewardsPoolStakerABI,
        address: stakerContractAddress as `0x${string}`,
        functionName: 'exit',
      });

      return await wallet.writeContract(request);
    }

    const { request } = await this.provider.simulateContract({
      abi: NonCompoundingRewardsPoolABI,
      address: stakerContractAddress as `0x${string}`,
      functionName: 'exit',
    });

    return await wallet.writeContract(request);
  }

  completeExit(wallet: WalletClient, campaign: StakingInterface) {
    const { campaignAddress, version = '1.0' } = campaign;

    if (version === '1.0') {
      return this._completeExit(wallet, campaign);
    }

    return this.soloNonComp.completeExit(campaignAddress, wallet);
  }

  async _completeExit(wallet: WalletClient, campaign: StakingInterface) {
    const { campaignAddress: stakerContractAddress, compounding } = campaign;
    if (compounding) {
      const { request } = await this.provider.simulateContract({
        abi: CompoundingRewardsPoolStakerABI,
        address: stakerContractAddress as `0x${string}`,
        functionName: 'completeExit',
      });

      return await wallet.writeContract(request);
    }

    const { request } = await this.provider.simulateContract({
      abi: NonCompoundingRewardsPoolABI,
      address: stakerContractAddress as `0x${string}`,
      functionName: 'completeExit',
    });

    return await wallet.writeContract(request);
  }

  async getCardDataCommon(wallet: WalletClient, campaign: StakingInterface) {
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

    return this[cardDataMethod](wallet, campaign);
  }

  async getCardData(wallet: WalletClient, campaign: StakingInterface) {
    const userAddress = await getAddressFromWallet(wallet);

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

    const compoundingConfig = {
      abi: CompoundingRewardsPoolStakerABI,
      address: stakerCampaignAddress as `0x${string}`,
    };
    const nonCompoundingConfig = {
      abi: NonCompoundingRewardsPoolABI,
      address: stakerCampaignAddress as `0x${string}`,
    };

    const campaignAddress = compounding
      ? await this.provider.readContract({
          ...compoundingConfig,
          functionName: 'rewardPool',
        })
      : (stakerCampaignAddress as `0x${string}`);

    const result = await Promise.all([
      this._getRewardsAndDurations(campaignAddress),
      this._calculateAPY(campaignAddress),
      compounding
        ? this.provider.readContract({ ...compoundingConfig, functionName: 'totalAmountStaked' })
        : this.provider.readContract({ ...nonCompoundingConfig, functionName: 'totalStaked' }),
      this.provider.readContract({
        ...nonCompoundingConfig,
        functionName: 'contractStakeLimit',
      }),
      this.provider.readContract({
        ...nonCompoundingConfig,
        functionName: 'stakeLimit',
      }),
      this.coingecko.getTokenPrice(stakingTokenId, 'usd'),
      getBalance(this.provider, campaignTokenAddress as `0x${string}`, userAddress),
      this._getCoolDownPeriod(wallet, stakerCampaignAddress as `0x${string}`),
      this.getState(wallet, stakerCampaignAddress as `0x${string}`),
    ]);

    const {
      duration: durationMilliseconds,
      expirationTime,
      totalRewards,
      weeklyRewards,
    } = result[0];

    const totalStaked = result[2];
    const contractStakeLimit = result[3];
    const stakeLimit = result[4];
    const stakingTokenPrice = result[5];
    const userBalance = result[6];
    const cooldownPeriod = result[7];

    const stateResult = result[8];
    const apy =
      stateResult != STAKING_CAMPAIGN_STATE.STAKING_IN_PROGRESS &&
      stateResult != STAKING_CAMPAIGN_STATE.NOT_STARTED
        ? 0
        : result[1];

    const duration = formatStakingDuration(durationMilliseconds);

    const userRewards =
      stateResult <= 1
        ? await this._getAllUserAccumulatedRewards(
            wallet,
            campaignAddress,
            stakerCampaignAddress as `0x${string}`,
            compounding,
          )
        : compounding
        ? this._getAllPendingRewardsAuto(
            wallet,
            stakerCampaignAddress as `0x${string}`,
            campaignAddress,
          )
        : await this._getAllPendingRewards(stakerCampaignAddress as `0x${string}`);

    const userStakedTokens = await this.getUserStakedTokens(
      wallet,
      stakerCampaignAddress as `0x${string}`,
      stateResult,
      compounding,
    );

    // Check limits
    const hasContractStakeLimit = !checkMaxStakingLimit(contractStakeLimit);
    const hasUserStakeLimit = !checkMaxStakingLimit(stakeLimit);

    // format tokens
    const userStakedAmount = await formatToken(
      this.provider,
      userStakedTokens,
      campaignTokenAddress as `0x${string}`,
    );

    const formattedTotalStaked = await formatToken(
      this.provider,
      totalStaked,
      campaignTokenAddress as `0x${string}`,
    );
    const formattedContractStakeLimit = await formatToken(
      this.provider,
      contractStakeLimit,
      campaignTokenAddress as `0x${string}`,
    );
    const formattedStakeLimit = await formatToken(
      this.provider,
      stakeLimit,
      campaignTokenAddress as `0x${string}`,
    );

    const userWalletTokensBalance = await formatToken(
      this.provider,
      userBalance,
      campaignTokenAddress as `0x${string}`,
    );

    // Calculate percentage limit
    const percentage = this._calculatePercentageLimit(totalStaked, contractStakeLimit);

    const totalStakedUSD = (Number(formattedTotalStaked) * stakingTokenPrice).toString();

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
      contractStakeLimit: formattedContractStakeLimit,
      cooldownPeriod,
      emptyCardData: false,
      expirationTime,
      duration,
      hasContractStakeLimit,
      hasUserStakeLimit,
      pair,
      percentage,
      stakeLimit: formattedStakeLimit,
      state: stateResult,
      totalStaked: formattedTotalStaked,
      totalStakedUSD,
      userRewards,
      userStakedAmount,
      userWalletTokensBalance,
      totalRewards,
      weeklyRewards,
      rewardToken,
    };
  }

  async getCardDataNew(wallet: WalletClient, campaign: StakingInterface) {
    //Get campaign data
    const { campaignAddress, campaignTokenAddress, rewardsAddresses, version } = campaign;
    const nativeTokenName = dexByNetworkMapping[campaign.network].nativeToken;
    let isNativeSupported: boolean = false;

    const userAddress = await getAddressFromWallet(wallet);

    // If this is a liquidity provider, then try to get the function getReservers()
    let isLpToken: boolean = false;
    let token0: string = '';
    let token1: string = '';

    try {
      token0 = await this.provider.readContract({
        abi: LiquidityProviderABI,
        address: campaignTokenAddress as `0x${string}`,
        functionName: 'token0',
      });
      token1 = await this.provider.readContract({
        abi: LiquidityProviderABI,
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

      if (nativeTokenName === symbol || nativeTokenName === symbol.substring(1))
        isNativeSupported = true;
    } else {
      symbol = 'LP';
    }

    // Get data from new SDK
    const campaignData = await this.soloNonComp.getCampaignData(campaignAddress);

    // Get campaign state
    const state = await this.getState(wallet, campaignAddress as `0x${string}`, version);

    // Get user data
    const userData = await this.soloNonComp.getUserData(campaignAddress, wallet);

    const userWalletTokensBalanceBN = isNativeSupported
      ? await this.provider.getBalance({ address: userAddress, blockTag: 'safe' })
      : await getBalance(this.provider, campaignTokenAddress as `0x${string}`, userAddress);

    const tokenDecimals = await getTokenDecimals(
      this.provider,
      campaignTokenAddress as `0x${string}`,
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
      campaignStartTimestamp,
      campaignEndTimestamp,
      name,
      wrappedNativeToken,
    } = campaignData;

    const upcoming = Number(campaignStartTimestamp) > Math.floor(Date.now() / 1000);

    if (!hasCampaignStarted && !upcoming) {
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
      userWalletTokensBalance,
      totalStaked,
      userStakedAmount,
      walletStakeLimit,
      contractStakeLimit,
    ] = formatValuesToString(
      [
        userWalletTokensBalanceBN,
        totalStakedBN,
        userStakedAmountBN,
        walletStakeLimitBN,
        contractStakeLimitBN,
      ],
      tokenDecimals,
    );

    // Format durations
    const { duration: durationMilliseconds, expirationTime } = this._formatDurationExpiration(
      Number(deltaDuration),
      Number(deltaExpiration),
    );

    const duration = formatStakingDuration(durationMilliseconds);

    // Format campaign rewards
    const {
      campaignRewardsTotal: totalRewards,
      campaignRewardsWeekly: weeklyRewards,
      campaignRewardsPerDayUSD,
    } = await this._formatCampaignRewards(1, campaignRewardsBN);

    // Calculate percentage limit
    const percentage = this._calculatePercentageLimit(totalStakedBN, contractStakeLimitBN);

    // Get data for APY calculation
    let totalStakedUSD = Number(totalStaked) * stakingTokenPrice;

    if (isLpToken) {
      totalStakedUSD = await this._getTotalStakedUSD(
        campaignTokenAddress as `0x${string}`,
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
      apy: !upcoming ? apy : 0,
      autoCompounding: false,
      campaign: {
        ...campaign,
        name,
        isLpToken,
        campaignStart: Number(campaignStartTimestamp),
        campaignEnd: Number(campaignEndTimestamp),
        wrappedNativeToken,
        isNativeSupported,
      },
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
      state: !upcoming ? state : 5,
      totalRewards,
      totalStaked,
      totalStakedUSD,
      userRewards,
      userStakedAmount,
      userWalletTokensBalance,
      weeklyRewards,
      rewardToken,
      upcoming,
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

    const compoundingConfig = {
      abi: CompoundingRewardsPoolStakerABI,
      address: stakerCampaignAddress as `0x${string}`,
    };
    const nonCompoundingConfig = {
      abi: NonCompoundingRewardsPoolABI,
      address: stakerCampaignAddress as `0x${string}`,
    };

    const campaignAddress = compounding
      ? await this.provider.readContract({
          ...compoundingConfig,
          functionName: 'rewardPool',
        })
      : (stakerCampaignAddress as `0x${string}`);

    const result = await Promise.all([
      this._getRewardsAndDurations(campaignAddress),
      this._calculateAPY(campaignAddress),
      compounding
        ? this.provider.readContract({ ...compoundingConfig, functionName: 'totalAmountStaked' })
        : this.provider.readContract({ ...nonCompoundingConfig, functionName: 'totalStaked' }),

      this.coingecko.getTokenPrice(stakingTokenId, 'usd'),
      this.provider.readContract({
        ...nonCompoundingConfig,
        functionName: 'contractStakeLimit',
      }),
      this.provider.readContract({
        ...nonCompoundingConfig,
        functionName: 'stakeLimit',
      }),
      this.getDisconnectedState(stakerCampaignAddress as `0x${string}`, '1.0'),
    ]);

    const {
      duration: durationMilliseconds,
      expirationTime,
      totalRewards,
      weeklyRewards,
    } = result[0];
    const apy = result[1];
    const totalStaked = result[2];
    const stakingTokenPrice = result[3];
    const contractStakeLimit = result[4];
    const stakeLimit = result[5];
    const state = result[6];

    const duration = formatStakingDuration(durationMilliseconds);

    // Check limits
    const hasContractStakeLimit = !checkMaxStakingLimit(contractStakeLimit);
    const hasUserStakeLimit = !checkMaxStakingLimit(stakeLimit);

    // format tokens
    const formattedTotalStaked = await formatToken(
      this.provider,
      totalStaked,
      campaignTokenAddress as `0x${string}`,
    );
    const formattedContractStakeLimit = await formatToken(
      this.provider,
      contractStakeLimit,
      campaignTokenAddress as `0x${string}`,
    );
    const formattedStakeLimit = await formatToken(
      this.provider,
      stakeLimit,
      campaignTokenAddress as `0x${string}`,
    );

    // Calculate percentage limit
    const percentage = this._calculatePercentageLimit(totalStaked, contractStakeLimit);

    const totalStakedUSD = Number(formattedTotalStaked) * stakingTokenPrice;

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
      contractStakeLimit: formattedContractStakeLimit,
      emptyCardData: true,
      expirationTime,
      duration,
      hasContractStakeLimit,
      hasUserStakeLimit,
      pair,
      percentage,
      stakeLimit: formattedStakeLimit,
      state,
      totalStaked: formattedTotalStaked,
      totalStakedUSD,
      totalRewards,
      weeklyRewards,
      rewardToken,
    };
  }

  async getEmptyCardDataNew(campaign: StakingInterface) {
    //Get campaign data
    const { campaignAddress, campaignTokenAddress, rewardsAddresses } = campaign;

    // If this is a liquidity provider, then try to get the function getReservers()
    let isLpToken: boolean = false;
    let token0: string = '';
    let token1: string = '';

    try {
      token0 = await this.provider.readContract({
        abi: LiquidityProviderABI,
        address: campaignTokenAddress as `0x${string}`,
        functionName: 'token0',
      });
      token1 = await this.provider.readContract({
        abi: LiquidityProviderABI,
        address: campaignTokenAddress as `0x${string}`,
        functionName: 'token1',
      });

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
    const state = await this.getDisconnectedState(campaignAddress as `0x${string}`, '3.0');

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
      campaignStartTimestamp,
      campaignEndTimestamp,
      name,
    } = campaignData;

    const upcoming = Number(campaignStartTimestamp) > Math.floor(Date.now() / 1000);

    if (!hasCampaignStarted && !upcoming) {
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
      Number(deltaDuration),
      Number(deltaExpiration),
    );

    const duration = formatStakingDuration(durationMilliseconds);

    // Format campaign rewards
    const {
      campaignRewardsTotal: totalRewards,
      campaignRewardsWeekly: weeklyRewards,
      campaignRewardsPerDayUSD,
    } = await this._formatCampaignRewards(1, campaignRewardsBN);

    // Calculate percentage limit
    const percentage = this._calculatePercentageLimit(totalStakedBN, contractStakeLimitBN);

    // Get data for APY calculation
    let totalStakedUSD = Number(totalStaked) * stakingTokenPrice;

    if (isLpToken) {
      totalStakedUSD = await this._getTotalStakedUSD(
        campaignTokenAddress as `0x${string}`,
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
      apy: !upcoming ? apy : 0,
      autoCompounding: false,
      campaign: {
        ...campaign,
        name,
        isLpToken,
        campaignStart: Number(campaignStartTimestamp),
        campaignEnd: Number(campaignEndTimestamp),
      },
      contractStakeLimit,
      emptyCardData: true,
      expirationTime,
      duration,
      hasContractStakeLimit,
      hasUserStakeLimit,
      pair,
      percentage,
      stakeLimit: walletStakeLimit,
      state: !upcoming ? state : 5,
      totalRewards,
      totalStaked,
      totalStakedUSD,
      weeklyRewards,
      rewardToken,
      upcoming,
    };
  }

  async getPoolReserveBalances(
    poolAddress: `0x${string}`,
    provisionTokensAddresses: string[],
  ): Promise<Result> {
    const reserves = await this.provider.readContract({
      abi: LiquidityProviderABI,
      address: poolAddress,
      functionName: 'getReserves',
    });
    const tokenNames = provisionTokensAddresses.map(
      tokenAddress =>
        getTokenByPropName(this.tokenConfigs, TokenConfigsProps.ADDRESS, tokenAddress.toLowerCase())
          .symbol,
    );

    const totalSupply = await await this.provider.readContract({
      abi: LiquidityProviderABI,
      address: poolAddress,
      functionName: 'totalSupply',
    });
    const pool = poolTupleToString(tokenNames);
    const result: Record<string, string> = {};
    result[pool] = await formatToken(this.provider, totalSupply, poolAddress);

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

  async _getTotalStakedUSD(
    poolAddress: `0x${string}`,
    provisionTokensAddresses: string[],
    totalStaked: number,
  ) {
    // Get pool data
    const liquidityPoolSupply = await getTotalSupply(this.provider, poolAddress);
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

  async _getPriceLpUSD(poolAddress: `0x${string}`, provisionTokensAddresses: string[]) {
    // Get pool data
    const liquidityPoolSupply = await getTotalSupply(this.provider, poolAddress);
    const liquidityPoolSupplyFormated = Number(formatEther(liquidityPoolSupply));

    const reservesBalances = await this.getPoolReserveBalances(
      poolAddress,
      provisionTokensAddresses,
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

  async _getRewardsAndDurations(campaignAddress: `0x${string}`) {
    const campaignInstance = getContract({
      abi: parsedAbi,
      address: campaignAddress,
      publicClient: this.provider,
    });

    const result = await Promise.all([
      this.provider.getBlock(),
      campaignInstance.read.startBlock(),
      campaignInstance.read.endBlock(),
    ]);

    const currentBlock = result[0];
    const startBlock = result[1];
    const endBlock = result[2];

    const durationInBlocks = endBlock - startBlock;
    const exp = endBlock - BigInt(currentBlock.number ?? 0n);
    const expirationInBlocks = exp > 0n ? exp : 0n;

    const totalRewards: Record<string, string> = {};
    const weeklyRewards: Record<string, string> = {};

    const rewardsCount = await campaignInstance.read.getRewardTokensCount();

    for (let i = 0n; i < rewardsCount; i++) {
      const rewardTokenAddress = await campaignInstance.read.rewardsTokens([i]);
      const rewardAmountPerBlock = await campaignInstance.read.rewardPerBlock([i]);

      const rewardTokenName = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        rewardTokenAddress.toLowerCase(),
      ).symbol;

      const totalRewardAmount = await formatToken(
        this.provider,
        rewardAmountPerBlock * durationInBlocks,
        rewardTokenAddress,
      );

      totalRewards[rewardTokenName] = totalRewardAmount;

      const weeklyRewardAmount = await formatToken(
        this.provider,
        rewardAmountPerBlock * BigInt(BLOCKS_COUNT[this.protocol].PER_WEEK),
        rewardTokenAddress,
      );

      weeklyRewards[rewardTokenName] = weeklyRewardAmount;
    }

    // Time
    const expirationTimeInSeconds = convertBlockToSeconds(expirationInBlocks, this.protocol);
    const expirationTimeInMilliseconds = expirationTimeInSeconds * 1000n;

    const durationPeriodInSeconds = convertBlockToSeconds(durationInBlocks, this.protocol);
    const durationPeriodInMilliseconds = durationPeriodInSeconds * 1000n;

    return {
      duration: Number(durationPeriodInMilliseconds),
      expirationTime: Number(expirationTimeInMilliseconds),
      totalRewards,
      weeklyRewards,
    };
  }

  async _calculateAPY(campaignAddress: `0x${string}`) {
    const campaignInstance = getContract({
      abi: parsedAbi,
      address: campaignAddress,
      publicClient: this.provider,
    });

    const result = await Promise.all([
      campaignInstance.read.stakingToken(),
      campaignInstance.read.totalStaked(),
      campaignInstance.read.startBlock(),
      campaignInstance.read.endBlock(),
    ]);

    let totalRewardPerBlockInUSD = 0;
    const rewardsCount = await campaignInstance.read.getRewardTokensCount();

    for (let i = 0n; i < rewardsCount; i++) {
      const rewardTokenAddress = await campaignInstance.read.rewardsTokens([i]);
      const rewardAmountPerBlock = await formatToken(
        this.provider,
        await campaignInstance.read.rewardPerBlock([i]),
        rewardTokenAddress,
      );

      const rewardToken = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        rewardTokenAddress.toLowerCase(),
      );

      // PRICE
      const tokenId = rewardToken.coinGeckoID;
      const priceInUSD = await this.coingecko.getTokenPrice(tokenId, 'usd');

      // CALCULATE
      const rewardAmountInUSD = Number(rewardAmountPerBlock) * priceInUSD;
      totalRewardPerBlockInUSD += rewardAmountInUSD;
    }

    const stakingToken = result[0];
    const totalStaked = await formatToken(this.provider, result[1], stakingToken);
    const startBlock = result[2];
    const endBlock = result[3];

    // total rewards in USD
    const durationInBlocks = endBlock - startBlock;
    const totalRewardsInUSD = totalRewardPerBlockInUSD * Number(durationInBlocks);

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
    const seconds = await convertBlockToSeconds(endBlock - startBlock, this.protocol);
    const days = Math.floor(Number(seconds) / day);

    // APY
    let apy = 0;

    if (days !== 0) {
      apy = tpy / (days / year);
    }

    return apy * 100;
  }

  async _getCoolDownPeriod(wallet: WalletClient, campaignAddress: `0x${string}`) {
    const currentBlock = await this.provider.getBlock();
    const userAddress = await getAddressFromWallet(wallet);

    const [exitBlock] = await this.provider.readContract({
      address: campaignAddress,
      abi: NonCompoundingRewardsPoolABI,
      functionName: 'exitInfo',
      args: [userAddress],
    });

    const cdBlocks = exitBlock - BigInt(currentBlock.number ?? 0n);
    const userCooldownBlocks = cdBlocks > 0 ? cdBlocks : 0n;

    const coolDownSeconds = await convertBlockToSeconds(userCooldownBlocks, this.protocol);
    const coolDown = coolDownSeconds + currentBlock.timestamp;

    return Number(coolDown);
  }

  async getState(wallet: WalletClient, stakerCampaignAddress: `0x${string}`, version = '1.0') {
    if (version === '1.0') {
      const userAddress = await getAddressFromWallet(wallet);

      const stakerInstance = getContract({
        abi: parsedAbi,
        address: stakerCampaignAddress,
        publicClient: this.provider,
      });

      const result = await Promise.all([
        this.provider.getBlock(),
        stakerInstance.read.startBlock(),
        stakerInstance.read.endBlock(),
        stakerInstance.read.exitInfo([userAddress]),
      ]);

      const currentBlock = result[0].number ?? 0n;
      const startBlock = result[1];
      const endBlock = result[2];
      const [exitBlock, exitStake] = result[3];

      if (currentBlock < startBlock) {
        return -1; // "StakingHasNotStartedYet"
      }

      if (currentBlock < endBlock) {
        return 0; // "StakingInProgress"
      }

      if (exitBlock === 0n) {
        return 1; // "StakingEnded/NoWithdrawTriggered"
      }

      if (currentBlock <= exitBlock) {
        return 2; // "StakingEnded/WithdrawTriggered/InCooldown"
      }

      if (currentBlock > exitBlock) {
        if (exitStake > 0n) {
          return 3; // "StakingEnded/WithdrawTriggered/CooldownExpired/RewardNotClaimed"
        }

        return 4; //"StakingEnded/WithdrawTriggered/CooldownExpired/RewardClaimed"
      }
    } else {
      const { hasCampaignStarted, hasCampaignEnded, upcoming } =
        await this.soloNonComp.getCampaignStatusActive(stakerCampaignAddress, wallet);

      if (upcoming) {
        return 5;
      }

      const userData = await this.soloNonComp.getUserData(stakerCampaignAddress, wallet);

      const { exitTimestamp, exitStake } = userData;

      // Calculate cooldown
      const now = Date.now();
      const nowInSeconds = now / 1000;
      const exitTimestampInSeconds = Number(exitTimestamp);

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
        if (exitStake > 0n) {
          return 3; // "StakingEnded/WithdrawTriggered/CooldownExpired/RewardNotClaimed"
        }

        return 4; //"StakingEnded/WithdrawTriggered/CooldownExpired/RewardClaimed"
      }
    }

    return 0;
  }

  async _getUserAccumulatedRewardAuto(
    userAddress: `0x${string}`,
    stakerCampaignAddress: `0x${string}`,
    campaignAddress: `0x${string}`,
  ) {
    const stakerInstance = getContract({
      abi: parsedAbi,
      address: stakerCampaignAddress,
      publicClient: this.provider,
    });

    const campaignInstance = getContract({
      abi: parsedAbi,
      address: campaignAddress,
      publicClient: this.provider,
    });

    const currentStake = await stakerInstance.read.userStakedAmount([userAddress]);

    const promiseArray = [
      stakerInstance.read.exitStake(),
      stakerInstance.read.totalShares(),
      stakerInstance.read.share([userAddress]),
      campaignInstance.read.totalStaked(),
    ];

    const [exitStake, totalShares, userShare, totalStakedInPool] = await Promise.all(promiseArray);

    if (totalStakedInPool === 0n || totalShares === 0n) {
      return 0n;
    }

    // Get accumulated rewards (assuming there is only one reward token)
    const accumulatedRewards = await campaignInstance.read.getUserAccumulatedReward([
      stakerInstance.address,
      0n,
    ]);

    // Calculate total pool value based on total staked + accumulated rewards
    const poolTotalTokens = totalStakedInPool + accumulatedRewards - exitStake;

    const unit = 10n ** 18n;

    // Calculate value per share
    const valuePerShare = (poolTotalTokens * unit) / totalShares;

    // Calculate total user value
    return (valuePerShare * userShare) / unit - currentStake;
  }

  async _getAllUserAccumulatedRewards(
    wallet: WalletClient,
    campaignAddress: `0x${string}`,
    stakerCampaignAddress: `0x${string}`,
    compounding: boolean,
  ) {
    const stakerInstance = getContract({
      abi: parsedAbi,
      address: stakerCampaignAddress,
      publicClient: this.provider,
    });

    const userAddress = await getAddressFromWallet(wallet);

    const stakedTokens = await stakerInstance.read.balanceOf([userAddress]);
    const hasUserStaked = stakedTokens > 0n;

    const userRewards: Record<string, string> = {};
    const rewardsCount = await stakerInstance.read.getRewardTokensCount();

    for (let i = 0n; i < rewardsCount; i++) {
      const rewardTokenAddress = await stakerInstance.read.rewardsTokens([i]);
      const rewardTokenName = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        rewardTokenAddress.toLowerCase(),
      ).symbol;

      let formattedReward = '0';

      if (hasUserStaked) {
        const currentReward = compounding
          ? await this._getUserAccumulatedRewardAuto(
              userAddress,
              stakerCampaignAddress,
              campaignAddress,
            )
          : await stakerInstance.read.getUserAccumulatedReward([userAddress, 0n]);
        formattedReward = await formatToken(this.provider, currentReward, rewardTokenAddress);
      }

      userRewards[rewardTokenName] = formattedReward;
    }

    return userRewards;
  }

  async _getAllPendingRewards(campaignAddress: `0x${string}`) {
    const campaignInstance = getContract({
      abi: parsedAbi,
      address: campaignAddress,
      publicClient: this.provider,
    });

    const rewardsCount = await campaignInstance.read.getRewardTokensCount();
    const pendingRewards: Record<string, string> = {};

    for (let i = 0n; i < rewardsCount; i++) {
      const rewardTokenAddress = await campaignInstance.read.rewardsTokens([i]);
      const rewardTokenName = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        rewardTokenAddress.toLowerCase(),
      ).symbol;

      const rewardTokenAmount = await campaignInstance.read.getPendingReward([i]);

      const formattedRewardTokenAmount = await formatToken(
        this.provider,
        rewardTokenAmount,
        rewardTokenAddress,
      );

      pendingRewards[rewardTokenName] = formattedRewardTokenAmount;
    }

    return pendingRewards;
  }

  async _getAllPendingRewardsAuto(
    wallet: WalletClient,
    stakerCampaignAddress: `0x${string}`,
    campaignAddress: `0x${string}`,
  ) {
    const pendingRewards: Record<string, string> = {};
    const userAddress = await getAddressFromWallet(wallet);

    const rewardTokenAddress = await this.provider.readContract({
      address: campaignAddress,
      abi: parsedAbi,
      functionName: 'rewardsTokens',
      args: [0n],
    });

    const rewardTokenName = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.ADDRESS,
      rewardTokenAddress.toLowerCase(),
    ).symbol;

    pendingRewards[rewardTokenName] = (
      await this._getUserAccumulatedRewardAuto(userAddress, stakerCampaignAddress, campaignAddress)
    ).toString();

    return pendingRewards;
  }

  async getUserStakedTokens(
    wallet: WalletClient,
    stakerCampaignAddress: `0x${string}`,
    state: number,
    compounding: boolean,
  ) {
    const userAddress = await getAddressFromWallet(wallet);

    const stakerInstance = getContract({
      address: stakerCampaignAddress,
      abi: parsedAbi,
      publicClient: this.provider,
    });

    let userStakedTokens: bigint = 0n;

    if (state <= 1) {
      if (compounding) {
        // Get campaign instance
        userStakedTokens = await stakerInstance.read.userStakedAmount([userAddress]);
      } else {
        userStakedTokens = await stakerInstance.read.balanceOf([userAddress]);
      }
    } else {
      userStakedTokens = (await stakerInstance.read.exitInfo([userAddress]))[1];
    }

    return userStakedTokens;
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
    const secondsInDayBN = BigInt(secondsInDay);
    const secondsInWeekBN = BigInt(secondsInWeek);

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
      const rewardPerSecond = currentReward.rewardPerSecond;
      const tokenAmountDaily = formatUnits(rewardPerSecond * secondsInDayBN, tokenDecimals);
      const tokenAmountWeekly = formatUnits(rewardPerSecond * secondsInWeekBN, tokenDecimals);

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

  _calculatePercentageLimit(totalStaked: bigint, contractStakeLimit: bigint) {
    const percentageBigInt =
      totalStaked > 0n && contractStakeLimit > 0n ? totalStaked / contractStakeLimit : 0n;

    return Number(percentageBigInt) * 100;
  }

  _calculateAPY_new(totalStakedUSD: number, campaignRewardsPerDayUSD: number) {
    return totalStakedUSD > 0 ? (campaignRewardsPerDayUSD / totalStakedUSD) * year * 100 : 0;
  }

  _calculateCooldown(exitTimestamp: bigint) {
    const now = Date.now();
    const nowInSeconds = now / 1000;
    const exitTimestampInSeconds = Number(exitTimestamp);
    const deltaCooldown = exitTimestampInSeconds - nowInSeconds;
    return nowInSeconds + deltaCooldown;
  }

  async getDisconnectedState(campaignAddress: `0x${string}`, version = '1.0') {
    if (version === '1.0') {
      const stakerInstance = getContract({
        abi: parsedAbi,
        address: campaignAddress,
        publicClient: this.provider,
      });

      const result = await Promise.all([
        this.provider.getBlock(),
        stakerInstance.read.startBlock(),
        stakerInstance.read.endBlock(),
      ]);

      const currentBlock = result[0].number ?? 0n;
      const startBlock = result[1];
      const endBlock = result[2];

      if (currentBlock < startBlock) {
        return -1; // "StakingHasNotStartedYet"
      }

      if (currentBlock < endBlock) {
        return 0; // "StakingInProgress"
      }
    } else {
      const { hasCampaignStarted, hasCampaignEnded, upcoming } =
        await this.soloNonComp.getCampaignStatus(campaignAddress);

      if (upcoming) {
        return 5;
      }

      if (!hasCampaignStarted) {
        return -1;
      }

      if (hasCampaignStarted && !hasCampaignEnded) {
        return 0;
      }
    }

    return 0;
  }

  async getMigrationWhitelist(campaign: StakingInterface, campaignsArr: string[]) {
    const { campaignAddress: stakerContractAddress } = campaign;

    const whiteList = await Promise.all(
      campaignsArr.map(key =>
        this.provider
          .readContract({
            abi: NonCompoundingRewardsPoolABI,
            address: stakerContractAddress as `0x${string}`,
            functionName: 'receiversWhitelist',
            args: [key as `0x${string}`],
          })
          .then((res: boolean) => res),
      ),
    );

    return campaignsArr.reduce((acc: string[], key: string, index: number) => {
      if (whiteList[index]) acc.push(key);
      return acc;
    }, []);
  }

  async migrateStake(wallet: WalletClient, transferFrom: string, transferTo: string) {
    const { request } = await this.provider.simulateContract({
      abi: NonCompoundingRewardsPoolABI,
      address: transferFrom as `0x${string}`,
      functionName: 'exitAndTransfer',
      args: [transferTo as `0x${string}`],
    });

    return await wallet.writeContract(request);
  }

  async getTotal(wallet: WalletClient, campaigns: StakingInterface[]) {
    const { getTokenPrice } = this.coingecko;

    const userAddress = await getAddressFromWallet(wallet);

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

      // If this is a liquidity provider, then try to get the function getReservers()
      let isLpToken: boolean = false;
      let token0: string = '';
      let token1: string = '';

      try {
        token0 = await this.provider.readContract({
          abi: LiquidityProviderABI,
          address: campaignTokenAddress as `0x${string}`,
          functionName: 'token0',
        });
        token1 = await this.provider.readContract({
          abi: LiquidityProviderABI,
          address: campaignTokenAddress as `0x${string}`,
          functionName: 'token1',
        });

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
        campaignTokenPrice = await this._getPriceLpUSD(campaignTokenAddress as `0x${string}`, [
          token0,
          token1,
        ]);
      }

      // Get state
      const state = await this.getState(wallet, stakerCampaignAddress as `0x${string}`, version);

      let userStakedTokens: bigint = 0n;
      let userRewards: bigint = 0n;

      if (version === '1.0') {
        // Get staked tokens
        if ((state as number) <= 1) {
          if (compounding) {
            // Get campaign instance
            userStakedTokens = await this.provider.readContract({
              abi: CompoundingRewardsPoolStakerABI,
              address: stakerCampaignAddress as `0x${string}`,
              functionName: 'userStakedAmount',
              args: [userAddress as `0x${string}`],
            });

            const userCompoundedTokens = await this.provider.readContract({
              abi: CompoundingRewardsPoolStakerABI,
              address: stakerCampaignAddress as `0x${string}`,
              functionName: 'userStakedAmount',
              args: [userAddress as `0x${string}`],
            });

            userRewards = userCompoundedTokens - userStakedTokens;
          } else {
            userStakedTokens = await this.provider.readContract({
              abi: NonCompoundingRewardsPoolABI,
              address: stakerCampaignAddress as `0x${string}`,
              functionName: 'balanceOf',
              args: [userAddress as `0x${string}`],
            });

            userRewards =
              userStakedTokens > 0n
                ? await this.provider.readContract({
                    abi: NonCompoundingRewardsPoolABI,
                    address: stakerCampaignAddress as `0x${string}`,
                    functionName: 'getUserAccumulatedReward',
                    args: [userAddress as `0x${string}`, 0n],
                  })
                : 0n;
          }
        } else {
          if (compounding) {
            userStakedTokens = 0n;
            // Can not extract initial staking amount, so it will be shown along with rewards
            const userExitInfo = await this.provider.readContract({
              abi: CompoundingRewardsPoolStakerABI,
              address: stakerCampaignAddress as `0x${string}`,
              functionName: 'exitInfo',
              args: [userAddress as `0x${string}`],
            });
            userRewards = userExitInfo[1];
          } else {
            const userExitInfo = await this.provider.readContract({
              abi: NonCompoundingRewardsPoolABI,
              address: stakerCampaignAddress as `0x${string}`,
              functionName: 'exitInfo',
              args: [userAddress as `0x${string}`],
            });
            userStakedTokens = userExitInfo[1];
            userRewards = await this.provider.readContract({
              abi: NonCompoundingRewardsPoolABI,
              address: stakerCampaignAddress as `0x${string}`,
              functionName: 'getPendingReward',
              args: [0n],
            });
          }
        }
      } else {
        const userData = await this.soloNonComp.getUserData(stakerCampaignAddress, wallet);

        userStakedTokens = userData.userStakedAmount;
        userRewards = userStakedTokens > 0n ? userData.userRewards[0].currentAmount : 0n;
      }

      // Format tokens
      const userStakedTokensFormatted = await formatToken(
        this.provider,
        userStakedTokens,
        campaignTokenAddress as `0x${string}`,
      );

      const userRewardsFormatted = await formatToken(
        this.provider,
        userRewards,
        campaignTokenAddress as `0x${string}`,
      );

      // Convert to USD
      const userStakedTokensUSD = Number(userStakedTokensFormatted) * campaignTokenPrice;
      const userRewardsUSD = Number(userRewardsFormatted) * campaignTokenPrice;

      totalData.tokenStakedInUSD = totalData.tokenStakedInUSD + userStakedTokensUSD;
      totalData.totalRewardInUSD = totalData.totalRewardInUSD + userRewardsUSD;
    }

    return totalData;
  }

  async getAllowance(wallet: WalletClient, campaign: StakingInterface) {
    const { campaignAddress: stakerContractAddress, campaignTokenAddress: stakeTokenAddress } =
      campaign;

    return getAllowance(
      wallet,
      this.provider,
      stakeTokenAddress as `0x${string}`,
      stakerContractAddress as `0x${string}`,
    );
  }

  async approveToken(wallet: WalletClient, campaign: StakingInterface) {
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

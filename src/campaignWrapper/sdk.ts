import { formatEther, formatUnits, parseAbi, PublicClient, WalletClient } from 'viem';

import {
  ALBStaker,
  CampaignRewards,
  CampaignRewardsNew,
  CoinGecko,
  dexByNetworkMapping,
  DexEnum,
  formatToken,
  formatValuesToString,
  getAddressFromWallet,
  getBalance,
  getTokenByPropName,
  getTotalSupply,
  LMInterface,
  NetworkEnum,
  poolTupleToString,
  Result,
  stableCoinsIds,
  StakerLM,
  TokenConfigs,
  TokenConfigsProps,
  UserDataLM,
  UserRewards,
  year,
} from '..';
import { ArrakisPoolABI } from '../abi/ArrakisPoolABI';
import { BalancerPoolABI } from '../abi/BalancerBPoolABI';
import { UniswapPoolABI } from '../abi/UniswapV2PairABI';

/**
 *  Represents a class that can interact with LMC's
 *  depending on the network.
 *  @constructor
 *  @param {PublicClient} provider - Provider with the global interaction.
 *  @param {StakerLM} lmcStaker - Class that helps with the actions of a LMC.
 *  @param {CoinGecko} coingecko - Class for fetching the balance of the CoinGecko API.
 *  @param {TokenConfigs} tokenConfigs - Tokens that are inside of the JSON config configuration.
 *  @param {NetworkEnum} protocol - Name of the network where this class is being used.
 */
export class CampaignWrapper {
  provider: PublicClient;
  lmcStaker: StakerLM;
  albStaker: ALBStaker;
  coingecko: CoinGecko;
  tokenConfigs: TokenConfigs;
  protocol: NetworkEnum;
  [key: string]: any;

  constructor(
    provider: PublicClient,
    lmcStaker: StakerLM,
    albStaker: ALBStaker,
    coingecko: CoinGecko,
    tokenConfigs: TokenConfigs,
    protocol: NetworkEnum,
  ) {
    this.provider = provider;
    this.lmcStaker = lmcStaker;
    this.albStaker = albStaker;
    this.coingecko = coingecko;
    this.tokenConfigs = tokenConfigs;
    this.protocol = protocol;
  }

  public stake(
    version: string,
    wallet: WalletClient,
    campaignAddress: string,
    lockSchemeAddress: string,
    amountToStake: string,
    isNativeSupported = false,
  ) {
    if (!version || version === '1.0') {
      return this.albStaker.stake(wallet, campaignAddress, lockSchemeAddress, amountToStake);
    }

    return this.lmcStaker.stake(campaignAddress, amountToStake, wallet, isNativeSupported);
  }

  public stakeWithTier(
    version: string,
    campaignAddress: string,
    amountToStake: string,
    signature: string,
    maxTier: number,
    deadline: number,
    wallet: WalletClient,
  ) {
    if (!version || version === '1.0') {
      throw new Error('Wrong version for tier campaign');
    }

    return this.lmcStaker.stakeWithTier(
      campaignAddress,
      amountToStake,
      signature,
      maxTier,
      deadline,
      wallet,
    );
  }

  public exit(version: string, wallet: WalletClient, campaignAddress: string) {
    if (!version || version === '1.0') {
      return this.albStaker.withdraw(wallet, campaignAddress);
    }

    return this.lmcStaker.exit(campaignAddress, wallet);
  }

  /**
   * Get empty card data for campaign (common for all versions)
   * @public
   * @param {object} campaign - campaign object
   * @return {object} campaign data object
   */
  public async getEmptyCardDataCommon(campaign: LMInterface): Promise<object> {
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

  async getEmptyCardData(campaign: LMInterface) {
    //Get campaign data
    const {
      campaignAddress,
      provisionTokensAddresses,
      dex,
      liquidityPoolAddress: poolAddress,
    } = campaign;

    // Get tuple & pairs
    const { tuple, pairs } = this._formatTuplePairs(provisionTokensAddresses);

    // Check for campaign started
    const hasCampaignStarted = await this.albStaker.hasCampaignStarted(campaignAddress);
    const hasCampaignEndedPromise = this.albStaker.hasCampaignEnded(campaignAddress);
    if (!hasCampaignStarted) return {};

    const totalStakedAmountBN = await this.albStaker.getTotalStakedAmount(campaignAddress);
    const totalStaked = formatEther(totalStakedAmountBN);

    const durationAndExpiration = this.albStaker.getExpirationAndDuration(campaignAddress);

    const campaignRewardsPromise = this.albStaker.getTotalRewardsAmount(
      campaignAddress,
      this.tokenConfigs,
    );

    const result = await Promise.all([
      durationAndExpiration,
      hasCampaignEndedPromise,
      campaignRewardsPromise,
      this.albStaker.getContractStakeLimit(campaignAddress),
    ]);

    const { duration, expirationTime } = result[0];
    const hasCampaignEnded = result[1];
    const campaignRewards = result[2];
    const contractStakeLimit = result[3];

    const campaignRewardsUSD = await this._getCampaignRewardsUSD_v1(campaignRewards);
    const [totalStakedString] = formatValuesToString([totalStakedAmountBN]);
    const durationDays = duration / (60 * 60 * 24 * 1000);

    // Get total staked in USD
    const totalStakedUSD = await this._getTotalStakedUSD_v1(
      poolAddress,
      provisionTokensAddresses,
      Number(totalStakedString),
      dex,
    );

    // Get APY
    const apy = hasCampaignEnded
      ? 0
      : this._calculateAPY_new(campaignRewardsUSD, totalStakedUSD, durationDays, year);

    return {
      apy,
      campaign,
      contractStakeLimit,
      dex,
      duration,
      emptyCardData: true,
      expirationTime,
      pairs,
      tuple,
      campaignRewards,
      totalStaked,
      totalStakedUSD,
    };
  }

  public async getEmptyCardDataNew(campaign: LMInterface) {
    //Get campaign data
    const {
      liquidityPoolAddress: poolAddress,
      campaignAddress,
      provisionTokensAddresses,
      dex,
    } = campaign;

    // Get tuple & pairs
    const { tuple, pairs } = this._formatTuplePairs(provisionTokensAddresses);

    // Get data from new SDK
    const campaignData = await this.lmcStaker.getCampaignData(campaignAddress);

    const {
      deltaDuration,
      deltaExpiration,
      rewardsCount,
      campaignRewards: campaignRewardsBN,
      totalStaked: totalStakedBN,
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
    const [totalStaked] = formatValuesToString([totalStakedBN]);

    // Format durations
    const { duration, durationDays, expirationTime } = this._formatDurationExpiration(
      Number(deltaDuration),
      Number(deltaExpiration),
    );

    // Format rewards
    const { campaignRewardsUSD, campaignRewards } = await this._formatCampaignRewards(
      rewardsCount,
      campaignRewardsBN,
    );

    // Get total staked in USD
    const totalStakedUSD = await this._getTotalStakedUSD(
      poolAddress,
      provisionTokensAddresses,
      Number(totalStaked),
      dex,
    );

    // Get APY
    const apy = this._calculateAPY_new(campaignRewardsUSD, totalStakedUSD, durationDays, year);

    return {
      apy: !upcoming ? apy : 0,
      campaign: { ...campaign, name, campaignEnd: Number(campaignEndTimestamp) },
      campaignRewards,
      dex,
      duration,
      emptyCardData: true,
      expirationTime,
      pairs,
      tuple,
      totalStaked,
      totalStakedUSD,
      upcoming,
    };
  }

  public async getCardDataCommon(wallet: WalletClient, campaign: LMInterface) {
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

  public async getCardData(wallet: WalletClient, campaign: LMInterface) {
    //Get campaign data
    const {
      liquidityPoolAddress: poolAddress,
      campaignAddress,
      provisionTokensAddresses,
      lockSchemeAddress: schemeAddress,
      dex,
      network,
    } = campaign;

    // Get tuple & pairs
    const { tuple, pairs } = this._formatTuplePairs(provisionTokensAddresses);

    // Get router address
    const { routerAddress } = dexByNetworkMapping[network].dexes[dex];

    // Critical check for lockschemes added
    if (schemeAddress === undefined) {
      return {};
    }

    // Check for campaign started
    const hasCampaignStarted = await this.albStaker.hasCampaignStarted(campaignAddress);
    const hasCampaignEndedPromise = this.albStaker.hasCampaignEnded(campaignAddress);

    if (!hasCampaignStarted) {
      return {};
    }

    const durationAndExpiration = this.albStaker.getExpirationAndDuration(campaignAddress);
    const contractStakeLimitPromise = this.albStaker.getContractStakeLimit(campaignAddress);
    let hasContractStakeLimit = this.albStaker.checkContractStakeLimit(campaignAddress);
    const userStakeLimitPromise = this.albStaker.getUserStakeLimit(campaignAddress);
    let hasUserStakeLimit = this.albStaker.checkUserStakeLimit(campaignAddress);
    const campaignRewardsPromise = this.albStaker.getTotalRewardsAmount(
      campaignAddress,
      this.tokenConfigs,
    );

    let rewards = this.albStaker.getCurrentReward(wallet, campaignAddress, this.tokenConfigs);

    let stakedTokens = this.albStaker.getStakingTokensBalance(wallet, campaignAddress);

    const LPTokensPromise = this._getPoolBalance(wallet, poolAddress, dex);

    const totalStakedAmountBN = await this.albStaker.getTotalStakedAmount(campaignAddress);
    const totalStaked = formatEther(totalStakedAmountBN);

    interface Result {
      [key: string]: any;
    }
    const result: Result = await Promise.all([
      rewards,
      stakedTokens,
      LPTokensPromise,
      hasCampaignEndedPromise,
      durationAndExpiration,
      campaignRewardsPromise,
      contractStakeLimitPromise,
      userStakeLimitPromise,
      hasContractStakeLimit,
      hasUserStakeLimit,
    ]);

    rewards = result[0];
    stakedTokens = result[1];
    const LPTokens = formatEther(result[2]);
    const hasCampaignEnded = result[3];
    const { duration, expirationTime } = result[4];
    const campaignRewards = result[5];
    const contractStakeLimit = String(result[6]);
    const userStakeLimit = String(result[7]);
    hasContractStakeLimit = result[8];
    hasUserStakeLimit = result[9];

    const campaignRewardsUSD = await this._getCampaignRewardsUSD_v1(campaignRewards);
    const [totalStakedString] = formatValuesToString([totalStakedAmountBN]);
    const durationDays = duration / (60 * 60 * 24 * 1000);

    // Get total staked in USD
    const totalStakedUSD = await this._getTotalStakedUSD_v1(
      poolAddress,
      provisionTokensAddresses,
      Number(totalStakedString),
      dex,
    );

    // Get APY
    const apy = hasCampaignEnded
      ? 0
      : this._calculateAPY_new(campaignRewardsUSD, totalStakedUSD, durationDays, year);

    return {
      apy,
      campaign: { ...campaign, routerAddress },
      contractStakeLimit,
      dex,
      duration,
      emptyCardData: false,
      expirationTime,
      hasContractStakeLimit,
      hasUserStakeLimit,
      LPTokens,
      pairs,
      rewards,
      tuple,
      stakedTokens,
      totalStaked,
      totalStakedUSD,
      campaignRewards,
      userStakeLimit,
    };
  }

  public async getCardDataNew(wallet: WalletClient, campaign: LMInterface) {
    //Get campaign data
    const {
      liquidityPoolAddress: poolAddress,
      campaignAddress,
      provisionTokensAddresses,
      dex,
      network,
    } = campaign;

    // Get tuple & pairs
    const { tuple, pairs } = this._formatTuplePairs(provisionTokensAddresses);

    // Get router address
    const { routerAddress } = dexByNetworkMapping[network].dexes[dex];

    const LPTokens = formatEther(await this._getPoolBalance(wallet, poolAddress, dex));

    // Get data from new SDK
    const campaignData = await this.lmcStaker.getCampaignData(campaignAddress);
    const userData: UserDataLM = await this.lmcStaker.getUserData(campaignAddress, wallet);

    const {
      deltaDuration,
      deltaExpiration,
      hasContractStakeLimit,
      hasWalletStakeLimit: hasUserStakeLimit,
      campaignRewards: campaignRewardsBN,
      rewardsCount,
      contractStakeLimit: contractStakeLimitBN,
      walletStakeLimit: walletStakeLimitBN,
      totalStaked: totalStakedBN,
      extensionDuration,
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

    const { userRewards, userStakedAmount: userStakedAmountBN } = userData;

    // Format values
    const [contractStakeLimit, userStakeLimit, stakedTokens, totalStaked] = formatValuesToString([
      contractStakeLimitBN,
      walletStakeLimitBN,
      userStakedAmountBN,
      totalStakedBN,
    ]);

    // Format durations
    const { duration, durationDays, expirationTime } = this._formatDurationExpiration(
      Number(deltaDuration),
      Number(deltaExpiration),
    );

    // Format campaign rewards
    const { campaignRewards, campaignRewardsUSD } = await this._formatCampaignRewards(
      rewardsCount,
      campaignRewardsBN,
    );

    // Format user rewards
    const rewards = this._formatUserRewards(userRewards);

    // Get total staked in USD
    const totalStakedUSD = await this._getTotalStakedUSD(
      poolAddress,
      provisionTokensAddresses,
      Number(totalStaked),
      dex,
    );

    // Get APY
    const apy = this._calculateAPY_new(campaignRewardsUSD, totalStakedUSD, durationDays, year);

    const willBeExtended = (extensionDuration ?? 0n) > 0n;

    return {
      apy: !upcoming ? apy : 0,
      campaign: {
        ...campaign,
        routerAddress,
        name,
        campaignStart: Number(campaignStartTimestamp),
        campaignEnd: Number(campaignEndTimestamp),
        wrappedNativeToken,
      },
      contractStakeLimit,
      dex,
      duration,
      emptyCardData: false,
      expirationTime,
      hasContractStakeLimit,
      hasUserStakeLimit,
      LPTokens,
      pairs,
      rewards,
      tuple,
      stakedTokens,
      totalStaked,
      totalStakedUSD,
      campaignRewards,
      userStakeLimit,
      willBeExtended,
      upcoming,
    };
  }

  private _formatTuplePairs(provisionTokensAddresses: string[]) {
    const tuple: string[] = [];
    const pairs = provisionTokensAddresses.map(address => {
      const { symbol } = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        address.toLowerCase(),
      );

      tuple.push(symbol);

      return {
        symbol,
        address,
      };
    });

    return {
      tuple,
      pairs,
    };
  }

  private async _getCampaignRewardsUSD_v1(campaignRewards: CampaignRewards) {
    let campaignRewardsUSD = 0;
    for (let index = 0; index < campaignRewards.total.length; index++) {
      const currentReward = campaignRewards.total[index];
      const currentTotalAmount = currentReward.tokenAmount;
      const currentAddress = currentReward.tokenAddress;

      const { coinGeckoID: tokenId } = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        currentAddress,
      );

      const priceUSD = stableCoinsIds.includes(tokenId)
        ? 1
        : await this.coingecko.getTokenPrice(tokenId, 'usd');
      const amountUSD = priceUSD * Number(currentTotalAmount);
      campaignRewardsUSD = campaignRewardsUSD + amountUSD;
    }

    return campaignRewardsUSD;
  }

  private async _getTotalStakedUSD_v1(
    poolAddress: string,
    provisionTokensAddresses: string[],
    totalStaked: number,
    dex: string,
  ) {
    // Get pool data
    const liquidityPoolSupply = await getTotalSupply(this.provider, poolAddress as `0x${string}`);
    const liquidityPoolSupplyFormated = Number(formatEther(liquidityPoolSupply));

    const reservesBalances = await this.getPoolReserveBalances(
      poolAddress,
      provisionTokensAddresses,
      dex,
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

  public async getPoolReserveBalances(
    poolAddress: string,
    provisionTokensAddresses: string[],
    dex: string,
  ): Promise<Result> {
    const tokenNames = provisionTokensAddresses.map(
      tokenAddress =>
        getTokenByPropName(this.tokenConfigs, TokenConfigsProps.ADDRESS, tokenAddress.toLowerCase())
          .symbol,
    );

    const totalSupply = await this.provider.readContract({
      abi: parseAbi(['function totalSupply() external view returns (uint256)']),
      address: poolAddress as `0x${string}`,
      functionName: 'totalSupply',
    });

    const pool = poolTupleToString(tokenNames);
    const result: Record<string, string> = {};
    result[pool] = await formatToken(this.provider, totalSupply, poolAddress as `0x${string}`);

    let reserves: [bigint, bigint] = [0n, 0n];

    if (dex !== DexEnum.balancer) {
      if (dex === DexEnum.arrakis) {
        const currentReserves = await this.provider.readContract({
          abi: ArrakisPoolABI,
          address: poolAddress as `0x${string}`,
          functionName: 'getUnderlyingBalances',
        });

        reserves = [currentReserves[0], currentReserves[1]];
      } else {
        const currentReserves = await this.provider.readContract({
          abi: UniswapPoolABI,
          address: poolAddress as `0x${string}`,
          functionName: 'getReserves',
        });

        reserves = [currentReserves[0], currentReserves[1]];
      }
    }

    for (let index = 0; index < tokenNames.length; index++) {
      const tokenName = tokenNames[index];
      const tokenAddress = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.SYMBOL,
        tokenName,
      ).address;

      if (dex === DexEnum.balancer) {
        const tokenBalance = await this.provider.readContract({
          abi: BalancerPoolABI,
          address: poolAddress as `0x${string}`,
          functionName: 'getBalance',
          args: [tokenAddress],
        });
        result[tokenName] = await formatToken(this.provider, tokenBalance, tokenAddress);
      } else {
        result[tokenName] = await formatToken(this.provider, reserves[index], tokenAddress);
      }
    }

    return result;
  }

  public async getCampaignStatusCommon(
    campaign: LMInterface,
    connected: boolean,
    wallet: WalletClient,
  ) {
    const { version } = campaign;
    interface VersionMapping {
      [key: string]: 'getCampaignStatus' | 'getCampaignStatusNew';
    }
    const versionMapping: VersionMapping = {
      '1.0': 'getCampaignStatus',
      '2.0': 'getCampaignStatusNew',
      '3.0': 'getCampaignStatusNew',
    };

    // Compose function name based on version
    const cardDataMethod = `${versionMapping[version]}`;

    return await this[cardDataMethod](campaign, connected, wallet);
  }

  public async getCampaignStatus(campaign: LMInterface, connected: boolean, wallet: WalletClient) {
    const { campaignAddress } = campaign;
    let hasUserStaked = false;

    const hasCampaignStarted = await this.albStaker.hasCampaignStarted(campaignAddress);
    const hasCampaignEnded = await this.albStaker.hasCampaignEnded(campaignAddress);

    if (connected) {
      hasUserStaked = await this.albStaker.getUserStakedInCampaign(wallet, campaignAddress);
    }

    return { hasCampaignStarted, hasCampaignEnded, hasUserStaked };
  }

  async getCampaignStatusNew(campaign: LMInterface, connected: boolean, wallet: WalletClient) {
    const { campaignAddress } = campaign;

    const { hasCampaignStarted, hasCampaignEnded, hasUserStaked, upcoming } =
      await this.lmcStaker.getCampaignStatus(campaignAddress, connected, wallet);

    return { hasCampaignStarted, hasCampaignEnded, hasUserStaked, upcoming };
  }

  private _calculateAPY_new(
    totalRewardsUSD: number,
    totalStakedUSD: number,
    durationDays: number,
    compoundPeriods: number,
  ) {
    // Check for 0s
    if (durationDays <= 0 || totalStakedUSD <= 0) return 0;

    const rewardsPerDayUSD = totalRewardsUSD / durationDays;
    const interest = rewardsPerDayUSD / totalStakedUSD;
    const APY = interest * compoundPeriods;

    return APY * 100;
  }

  private async _getPoolBalance(wallet: WalletClient, poolAddress: string, dex: string) {
    const userAddress = await getAddressFromWallet(wallet);

    let balance: bigint = 0n;

    if (dex === DexEnum.balancer) {
      balance = await this.provider.readContract({
        address: poolAddress as `0x${string}`,
        abi: BalancerPoolABI,
        functionName: 'balanceOf',
        args: [userAddress],
      });
    } else {
      balance = await getBalance(this.provider, poolAddress as `0x${string}`, userAddress);
    }

    return balance;
  }

  private _formatDurationExpiration(deltaDuration: number, deltaExpiration: number) {
    const duration = deltaDuration * 1000;
    const durationDays = deltaDuration / (60 * 60 * 24);
    const expirationTime = deltaExpiration * 1000;

    return {
      duration,
      durationDays,
      expirationTime,
    };
  }

  private async _formatCampaignRewards(
    rewardsCount: bigint,
    campaignRewardsBN: CampaignRewardsNew[],
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
        currentReward.rewardPerSecond * secondsInWeek,
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

  private async _getTotalStakedUSD(
    poolAddress: string,
    provisionTokensAddresses: string[],
    totalStaked: number,
    dex: string,
  ) {
    // Get pool data
    const liquidityPoolSupply = await getTotalSupply(this.provider, poolAddress as `0x${string}`);
    const liquidityPoolSupplyFormated = Number(formatEther(liquidityPoolSupply));

    const reservesBalances = await this.getPoolReserveBalances(
      poolAddress,
      provisionTokensAddresses,
      dex,
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

  private _formatUserRewards(userRewards: UserRewards[]) {
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
}

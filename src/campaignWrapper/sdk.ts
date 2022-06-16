import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcBatchProvider, JsonRpcSigner, Web3Provider } from '@ethersproject/providers';
import { formatEther, formatUnits } from '@ethersproject/units';

import {
  CampaignRewards,
  CoinGecko,
  dexByNetworkMapping,
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
import BalancerBPoolContractABI from '../abi/BalancerBPoolABI.json';
import UniswapV2PairABI from '../abi/UniswapV2PairABI.json';

export class CampaignWrapper {
  provider: Web3Provider | JsonRpcBatchProvider;
  lmcStaker: StakerLM;
  coingecko: CoinGecko;
  tokenConfigs: TokenConfigs;
  protocol: NetworkEnum;
  [key: string]: any;

  constructor(
    provider: Web3Provider | JsonRpcBatchProvider,
    lmcStaker: StakerLM,
    coingecko: CoinGecko,
    tokenConfigs: TokenConfigs,
    protocol: NetworkEnum,
  ) {
    this.provider = provider;
    this.lmcStaker = lmcStaker;
    this.coingecko = coingecko;
    this.tokenConfigs = tokenConfigs;
    this.protocol = protocol;
  }

  stake(campaignAddress: string, amountToStake: string) {
    return this.lmcStaker.stake(campaignAddress, amountToStake);
  }

  exit(campaignAddress: string) {
    return this.lmcStaker.exit(campaignAddress);
  }

  async getEmptyCardData(campaign: LMInterface) {
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
      name,
    } = campaignData;

    if (!hasCampaignStarted) {
      return {};
    }

    // Format values
    const [totalStaked] = formatValuesToString([totalStakedBN]);

    // Format durations
    const { duration, durationDays, expirationTime } = this._formatDurationExpiration(
      deltaDuration.toNumber(),
      deltaExpiration.toNumber(),
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
      apy,
      campaign: { ...campaign, name },
      campaignRewards,
      dex,
      duration,
      emptyCardData: true,
      expirationTime,
      pairs,
      tuple,
      totalStaked,
      totalStakedUSD,
    };
  }

  async getCardData(userWallet: JsonRpcSigner, campaign: LMInterface) {
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

    const LPTokens = formatEther(await this._getPoolBalance(userWallet, poolAddress, dex));

    // Get data from new SDK
    const campaignData = await this.lmcStaker.getCampaignData(campaignAddress);
    const userData: UserDataLM = await this.lmcStaker.getUserData(campaignAddress);

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
      name,
    } = campaignData;

    if (!hasCampaignStarted) {
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
      deltaDuration.toNumber(),
      deltaExpiration.toNumber(),
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

    const willBeExtended = BigNumber.from(extensionDuration).gt(BigNumber.from(0));

    return {
      apy,
      campaign: { ...campaign, routerAddress, name },
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
    };
  }

  _formatTuplePairs(provisionTokensAddresses: string[]) {
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

  async getPoolReserveBalances(
    poolAddress: string,
    provisionTokensAddresses: string[],
    dex: string,
  ): Promise<Result> {
    let reserves;
    const abi = dex === 'balancer' ? BalancerBPoolContractABI : UniswapV2PairABI;
    const poolContract = new Contract(poolAddress, abi, this.provider);
    const tokenNames = provisionTokensAddresses.map(
      tokenAddress =>
        getTokenByPropName(this.tokenConfigs, TokenConfigsProps.ADDRESS, tokenAddress.toLowerCase())
          .symbol,
    );

    const totalSupply = await poolContract.totalSupply();
    const pool = poolTupleToString(tokenNames);
    const result: Result = {};
    result[pool] = await formatToken(this.provider as Web3Provider, totalSupply, poolAddress);

    if (dex !== 'balancer') {
      reserves = await poolContract.getReserves();
    }

    for (let index = 0; index < tokenNames.length; index++) {
      const tokenName = tokenNames[index];
      const tokenAddress = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.SYMBOL,
        tokenName,
      ).address;

      if (dex === 'balancer') {
        const tokenBalance = await poolContract.getBalance(tokenAddress);
        result[tokenName] = await formatToken(
          this.provider as Web3Provider,
          tokenBalance,
          tokenAddress,
        );
      } else {
        result[tokenName] = await formatToken(
          this.provider as Web3Provider,
          reserves[index],
          tokenAddress,
        );
      }
    }
    return result;
  }

  async getCampaignStatus(campaign: LMInterface, connected: boolean) {
    const { campaignAddress } = campaign;

    const { hasCampaignStarted, hasCampaignEnded, hasUserStaked } =
      await this.lmcStaker.getCampaignStatus(campaignAddress, connected);

    return { hasCampaignStarted, hasCampaignEnded, hasUserStaked };
  }

  _calculateAPY_new(
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

  async _getPoolBalance(userWallet: JsonRpcSigner, poolAddress: string, dex: string) {
    const userAddress = await getAddressFromWallet(userWallet);
    let balance;
    if (dex === 'balancer') {
      const poolContract = new Contract(poolAddress, BalancerBPoolContractABI, this.provider);

      balance = await poolContract.balanceOf(userAddress);
    } else {
      balance = getBalance(this.provider as Web3Provider, poolAddress, userAddress);
    }

    return balance;
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

  async _getTotalStakedUSD(
    poolAddress: string,
    provisionTokensAddresses: string[],
    totalStaked: number,
    dex: string,
  ) {
    // Get pool data
    const liquidityPoolSupply = await getTotalSupply(this.provider as Web3Provider, poolAddress);
    const liquidityPoolSupplyFormated = Number(formatEther(liquidityPoolSupply.toString()));

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
}

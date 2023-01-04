import { Contract } from '@ethersproject/contracts';
import { JsonRpcBatchProvider, JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import { BigNumber as BigNumberJS } from 'bignumber.js';
import { BigNumber, providers } from 'ethers';
import { formatEther, formatUnits } from 'ethers/lib/utils';

import {
  CampaignRewardsNew,
  CoinGecko,
  formatStakingDuration,
  formatToken,
  formatValuesToString,
  getTokenByPropName,
  getTotalSupply,
  InfiniteStakingInterface,
  NetworkEnum,
  poolTupleToString,
  Result,
  stableCoinsIds,
  TokenConfigs,
  TokenConfigsProps,
  year,
} from '..';
import LpABI from '../abi/AllianceBlockDexPoolABI.json';
import { InfiniteStaker } from '../istaking/sdk';

export class InfiniteStakingWrapper {
  provider: JsonRpcProvider | JsonRpcBatchProvider;
  nonComp: InfiniteStaker;
  coingecko: CoinGecko;
  tokenConfigs: TokenConfigs;
  protocol: NetworkEnum;

  constructor(
    provider: JsonRpcProvider | JsonRpcBatchProvider,
    nonComp: InfiniteStaker,
    coingecko: CoinGecko,
    protocol: NetworkEnum,
    tokenConfigs: TokenConfigs,
  ) {
    this.provider = provider;
    this.nonComp = nonComp;
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

    return this.nonComp.stake(campaignAddress, campaignTokenAddress, amountToStake, userWallet);
  }

  async exit(userWallet: JsonRpcSigner, campaign: InfiniteStakingInterface) {
    return this.nonComp.exit(campaign.campaignAddress, userWallet);
  }

  async getEmptyCardDataCommon(campaign: InfiniteStakingInterface) {
    return this._getCampaignData(campaign);
  }

  async _getCampaignData(campaign: InfiniteStakingInterface) {
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
    const campaignData = await this.nonComp.getCampaignData(campaignAddress);

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
      hasCampaignStarted,
      pair,
      percentage,
      stakeLimit: walletStakeLimit,
      totalRewards,
      totalStaked,
      totalStakedUSD,
      weeklyRewards,
      rewardToken,
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
}

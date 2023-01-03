import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcBatchProvider, JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import { providers } from 'ethers';

import {
  CoinGecko,
  formatStakingDuration,
  formatValuesToString,
  getTokenByPropName,
  InfiniteStakingInterface,
  NetworkEnum,
  StakingInterface,
  TokenConfigs,
  TokenConfigsProps,
} from '..';
import LpABI from '../abi/AllianceBlockDexPoolABI.json';
import { InfiniteStaker } from '../istaking/sdk';

export class InfiniteStakingWrapper {
  provider: JsonRpcProvider | JsonRpcBatchProvider;
  nonComp: InfiniteStaker;
  coingecko: CoinGecko;
  tokenConfigs: TokenConfigs;
  protocol: NetworkEnum;
  [key: string]: any;

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
}

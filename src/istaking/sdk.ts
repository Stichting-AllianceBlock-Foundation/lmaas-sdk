import { getContract, PublicClient, WalletClient } from 'viem';

import {
  accuracy,
  getAddressFromWallet,
  getTokenDecimals,
  InfiniteCampaignBaseStatusData,
  InfiniteStakingState,
  PoolVersion,
  TokenConfigs,
} from '..';
import { NonCompoundingRewardsPoolInfiniteABI } from '../abi/NonCompoundingRewardsPoolInfinite';
import {
  InfiniteCampaignData,
  NetworkEnum,
  UserDataIStaking,
} from '../entities';
import { checkMaxStakingLimit, parseToken } from '../utils';

/**
 *  Represents a class that can interact with infiniteStaking campaigns
 *  depending on the network.
 *  @constructor
 *  @param {PublicClient} provider - Provider with the global interaction.
 *  @param {NetworkEnum} protocol - Name of the network where this class is being used.
 */

export class InfiniteStaker {
  protected protocol: NetworkEnum;
  protected provider: PublicClient;
  protected tokenConfigs: TokenConfigs;

  constructor(provider: PublicClient, protocol: NetworkEnum, tokenConfigs: TokenConfigs) {
    this.provider = provider;
    this.protocol = protocol;
    this.tokenConfigs = tokenConfigs;
  }
  /**
   * Get campaign data
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {CampaingData} CampaingData object
   */
  public async getCampaignData(campaignAddress: string): Promise<InfiniteCampaignData> {
    const campaignContract = getContract({
      abi: NonCompoundingRewardsPoolInfiniteABI,
      address: campaignAddress as `0x${string}`,
      publicClient: this.provider,
    });

    const now = BigInt(Math.floor(Date.now() / 1000));

    // Get raw contract data
    const {
      totalStaked: totalStakedPR,
      startTimestamp: startTimestampPR,
      endTimestamp: endTimestampPR,
      epochDuration: epochDurationPR,
      hasStakingStarted: hasStakingStartedPR,
      contractStakeLimit: contractStakeLimitPR,
      stakeLimit: stakeLimitPR,
      getRewardTokensCount: getRewardTokensCountPR,
      name: namePR,
    } = campaignContract.read;

    const [
      totalStaked,
      campaignStartTimestamp,
      campaignEndTimestamp,
      epochDuration,
      hasCampaignStarted,
      contractStakeLimit,
      walletStakeLimit,
      rewardsCount,
      name,
    ] = await Promise.all([
      totalStakedPR(),
      startTimestampPR(),
      endTimestampPR(),
      epochDurationPR(),
      hasStakingStartedPR(),
      contractStakeLimitPR(),
      stakeLimitPR(),
      getRewardTokensCountPR(),
      namePR(),
    ]);

    // Get deltas in seconds
    const deltaEpochEnd = campaignEndTimestamp - now;

    const campaignRewards = [];

    let rewardsDistributing = rewardsCount > 0n && hasCampaignStarted;
    const upcoming = campaignStartTimestamp > now;

    if (hasCampaignStarted || upcoming) {
      // Get rewards info
      for (let i = 0n; i < rewardsCount; i++) {
        const tokenAddress = await campaignContract.read.rewardsTokens([i]);
        const rewardPerSecond = await campaignContract.read.rewardPerSecond([i]);
        const totalRewards = (rewardPerSecond * epochDuration) / accuracy;

        campaignRewards.push({
          tokenAddress,
          rewardPerSecond,
          totalRewards,
        });

        rewardsDistributing = rewardsDistributing && rewardPerSecond > 0n;
      }
    }

    const hasCampaignEnded = campaignEndTimestamp < now;
    const hasContractStakeLimit = !checkMaxStakingLimit(contractStakeLimit);
    const hasWalletStakeLimit = !checkMaxStakingLimit(walletStakeLimit);

    return {
      totalStaked,
      hasCampaignStarted,
      hasCampaignEnded, // In this case, this means that the infinite staking campaign state on chain has not been updated yet for the next epoch
      campaignStartTimestamp,
      campaignEndTimestamp,
      contractStakeLimit,
      walletStakeLimit,
      hasContractStakeLimit,
      hasWalletStakeLimit,
      deltaExpiration: deltaEpochEnd,
      deltaDuration: epochDuration,
      campaignRewards,
      rewardsCount,
      rewardsDistributing,
      name,
    };
  }

  async getState(campaignAddress: string): Promise<InfiniteStakingState> {
    const baseStatus = await this.getCampaignStatus(campaignAddress);

    return this._getState(baseStatus);
  }

  protected _getState(statusData: InfiniteCampaignBaseStatusData): InfiniteStakingState {
    const { distributableFunds, endTimestamp, epochDuration, startTimestamp } = statusData;

    const now = Date.now() / 1000;

    // Unscheduled
    if (startTimestamp === 0) return InfiniteStakingState.NOT_STARTED;

    // Upcoming campaigns
    if (startTimestamp > now) return InfiniteStakingState.SCHEDULED;

    // Active campaigns
    if (now > startTimestamp) {
      if (now < endTimestamp) return InfiniteStakingState.ACTIVE;

      if (now < endTimestamp + epochDuration && distributableFunds)
        return InfiniteStakingState.ACTIVE;
    }

    return InfiniteStakingState.EXPIRED;
  }

  /**
   * Get campaign data
   * @public
   * @param {string} contractAddress - Address of the campaign contract
   * @return {InfiniteCampaignBaseStatusData} CampaingStatusData object
   */
  public async getCampaignStatus(campaignAddress: string): Promise<InfiniteCampaignBaseStatusData> {
    const campaignContract = getContract({
      abi: NonCompoundingRewardsPoolInfiniteABI,
      address: campaignAddress as `0x${string}`,
      publicClient: this.provider,
    });

    const campaignEndTimestamp = Number(await campaignContract.read.endTimestamp());
    const hasCampaignStarted = await campaignContract.read.hasStakingStarted();
    const campaignStartTimestamp = Number(await campaignContract.read.startTimestamp());
    const epochDuration = campaignEndTimestamp - campaignStartTimestamp;
    const now = Math.floor(Date.now() / 1000);

    const tokensCount = await campaignContract.read.getRewardTokensCount();

    let distributableFunds = false;
    if (hasCampaignStarted) {
      for (let i = 0n; i < tokensCount; i++) {
        const availableBalance = await campaignContract.read.getAvailableBalance([i]);

        const tokenAddress = await campaignContract.read.rewardsTokens([i]);
        const token = Object.values(this.tokenConfigs).find(item => item.address === tokenAddress);

        if (!token) {
          throw new Error('Token not found');
        }

        distributableFunds =
          distributableFunds ||
          availableBalance > 10n ** BigInt(token.decimals) / BigInt(epochDuration);
      }
    }

    return {
      distributableFunds,
      endTimestamp: campaignEndTimestamp,
      epochDuration: campaignEndTimestamp - campaignStartTimestamp,
      startTimestamp: campaignStartTimestamp,
      upcoming: campaignStartTimestamp > now,
    };
  }

  /**
   * Stake in campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {string} amountToStake - Amount to stake
   * @return {string} transaction has
   */
  public async stake(
    contractAddress: string,
    stakeTokenAddress: string,
    amountToStake: string,
    wallet: WalletClient,
  ): Promise<`0x${string}`> {
    const walletAddress = await getAddressFromWallet(wallet);

    const amountToStakeParsed = await parseToken(
      this.provider,
      amountToStake,
      stakeTokenAddress as `0x${string}`,
    );

    const { request } = await this.provider.simulateContract({
      abi: NonCompoundingRewardsPoolInfiniteABI,
      address: contractAddress as `0x${string}`,
      functionName: 'stake',
      args: [amountToStakeParsed],
      account: walletAddress,
    });

    return await wallet.writeContract(request);
  }

  /**
   * Exit from campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {string} transaction has
   */
  public async exit(contractAddress: string, wallet: WalletClient): Promise<`0x${string}`> {
    const walletAddress = await getAddressFromWallet(wallet);

    const { request } = await this.provider.simulateContract({
      abi: NonCompoundingRewardsPoolInfiniteABI,
      address: contractAddress as `0x${string}`,
      functionName: 'exit',
      account: walletAddress,
    });

    return await wallet.writeContract(request);
  }

  /**
   * Get user data
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {UserData} UserData object
   */
  public async getUserData(
    campaignAddress: string,
    wallet: WalletClient,
    version?: PoolVersion,
  ): Promise<UserDataIStaking> {
    const walletAddress = await getAddressFromWallet(wallet);

    // Get now in seconds and convert to BN
    const now = BigInt(Math.floor(Date.now() / 1000));

    const campaignContract = getContract({
      abi: NonCompoundingRewardsPoolInfiniteABI,
      address: campaignAddress as `0x${string}`,
      publicClient: this.provider,
    });

    const {
      balanceOf: balanceOfPR,
      userStakedEpoch: userStakedEpochPR,
      endTimestamp: endTimestampPR,
      epochCount: epochCountPR,
      getRewardTokensCount: getRewardTokensCountPR,
    } = campaignContract.read;

    const [userStakedAmount, userStakedEpoch, endTimestamp, epochCount, rewardsCount] =
      await Promise.all([
        balanceOfPR([walletAddress]),
        userStakedEpochPR([walletAddress]),
        endTimestampPR(),
        epochCountPR(),
        getRewardTokensCountPR(),
      ]);

    const userCanExit = userStakedEpoch < epochCount - 2n || endTimestamp < now;

    const userRewards = [];

    if (userStakedAmount > 0n) {
      for (let i = 0n; i < rewardsCount; i++) {
        const tokenAddress = await campaignContract.read.rewardsTokens([i]);
        let currentAmount = await campaignContract.read.getUserAccumulatedReward([
          walletAddress,
          i,
          now,
        ]);

        if (version === '4.0') {
          const decimals = await getTokenDecimals(this.provider, tokenAddress);

          currentAmount = (currentAmount * 10n ** BigInt(decimals)) / accuracy;
        }

        userRewards.push({
          tokenAddress,
          currentAmount,
        });
      }
    }

    return {
      userCanExit,
      userRewards,
      userStakedAmount,
    };
  }
}

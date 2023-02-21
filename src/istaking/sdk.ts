import { getContract, PublicClient, WalletClient } from 'viem';

import { accuracy, getAddressFromWallet } from '..';
import { NonCompoundingRewardsPoolInfiniteABI } from '../abi/NonCompoundingRewardsPoolInfinite';
import {
  InfiniteCampaignData,
  InfiniteCampaingStatusData,
  NetworkEnum,
  PoolVersion,
  UserDataIStaking,
} from '../entities';
import { checkMaxStakingLimit, getTokenDecimals, parseToken } from '../utils';

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

  constructor(provider: PublicClient, protocol: NetworkEnum) {
    this.provider = provider;
    this.protocol = protocol;
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
    if (hasCampaignStarted) {
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

  /**
   * Get campaign data
   * @public
   * @param {string} contractAddress - Address of the campaign contract
   * @return {CampaingStatusData} CampaingStatusData object
   */
  public async getCampaignStatus(campaignAddress: string): Promise<InfiniteCampaingStatusData> {
    const campaignContract = getContract({
      abi: NonCompoundingRewardsPoolInfiniteABI,
      address: campaignAddress as `0x${string}`,
      publicClient: this.provider,
    });

    // Get now in seconds and convert to BN
    const now = BigInt(Math.floor(Date.now() / 1000));

    // Get raw contract data
    const campaignEndTimestamp = await campaignContract.read.endTimestamp();
    const hasCampaignStarted = await campaignContract.read.hasStakingStarted();

    const currentEpochAssigned = campaignEndTimestamp > now;

    const tokensCount = await campaignContract.read.getRewardTokensCount();
    const epochDuration = await campaignContract.read.epochDuration();

    const rewardsCanDistribute = tokensCount > 0n && hasCampaignStarted && currentEpochAssigned;
    let rewardsDistributing = false;
    let unlockedRewards = false;

    if (hasCampaignStarted) {
      for (let i = 0n; i < tokensCount; i++) {
        const rewardsPerSecond = await campaignContract.read.rewardPerSecond([i]);

        rewardsDistributing = rewardsCanDistribute || rewardsPerSecond > 0n;

        const availableBalance = await campaignContract.read.getAvailableBalance([i]);

        unlockedRewards = unlockedRewards || availableBalance / epochDuration > 0n;
      }
    }

    return {
      hasCampaignStarted,
      currentEpochAssigned,
      rewardsDistributing,
      unlockedRewards,
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

    const userCanExit = userStakedEpoch < epochCount || endTimestamp < now;

    const userRewards = [];

    if (userStakedAmount < 0n) {
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

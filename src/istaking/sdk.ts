import { BigNumber } from '@ethersproject/bignumber';
import { JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import { Contract, providers } from 'ethers';

import NonCompoundingRewardsPoolInfiniteABI from '../abi/NonCompoundingRewardsPoolInfinite.json';
import { InfiniteCampaignData, InfiniteCampaingStatusData, NetworkEnum } from '../entities';
import { checkMaxStakingLimit, parseToken } from '../utils';

/**
 *  Represents a class that can interact with infiniteStaking campaigns
 *  depending on the network.
 *  @constructor
 *  @param {JsonRpcBatchProvider | JsonRpcProvider} provider - Provider with the global interaction.
 *  @param {NetworkEnum} protocol - Name of the network where this class is being used.
 */

export class InfiniteStaker {
  protected protocol: NetworkEnum;
  protected provider: JsonRpcProvider;

  constructor(provider: JsonRpcProvider, protocol: NetworkEnum) {
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
    const campaignContract = new Contract(
      campaignAddress,
      NonCompoundingRewardsPoolInfiniteABI,
      this.provider,
    );

    // Get now in seconds and convert to BN
    const now = Math.floor(Date.now());
    const nowBN = BigNumber.from(now);

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
    } = campaignContract;

    // const promiseArray = [
    //   totalStakedPR(),
    //   startTimestampPR(),
    //   endTimestampPR(),
    //   epochDurationPR(),
    //   hasStakingStartedPR(),
    //   contractStakeLimitPR(),
    //   stakeLimitPR(),
    //   getRewardTokensCountPR(),
    //   namePR(),
    // ];

    let totalStaked;
    let campaignStartTimestamp;
    let campaignEndTimestamp;
    let epochDuration;
    let hasCampaignStarted;
    let contractStakeLimit;
    let walletStakeLimit;
    let rewardsCount;
    let name;

    try {
      totalStaked = await totalStakedPR();
    } catch (err) {
      console.error('totalstaked');
    }
    try {
      campaignStartTimestamp = await startTimestampPR();
    } catch (err) {
      console.error('totalstaked');
    }
    try {
      campaignEndTimestamp = await endTimestampPR();
    } catch (err) {
      console.error('totalstaked');
    }
    try {
      epochDuration = await epochDurationPR();
    } catch (err) {
      console.error('totalstaked');
    }
    try {
      hasCampaignStarted = await hasStakingStartedPR();
    } catch (err) {
      console.error('totalstaked');
    }
    try {
      contractStakeLimit = await contractStakeLimitPR();
    } catch (err) {
      console.error('totalstaked');
    }
    try {
      walletStakeLimit = await stakeLimitPR();
    } catch (err) {
      console.error('totalstaked');
    }
    try {
      rewardsCount = await getRewardTokensCountPR();
    } catch (err) {
      console.error('totalstaked');
    }
    try {
      name = await namePR();
    } catch (err) {
      console.error('totalstaked');
    }

    // const [
    //   totalStaked,
    //   campaignStartTimestamp,
    //   campaignEndTimestamp,
    //   epochDuration,
    //   hasCampaignStarted,
    //   contractStakeLimit,
    //   walletStakeLimit,
    //   rewardsCount,
    //   name,
    // ] = await Promise.all(promiseArray);

    const rewardsCountNum = Number(rewardsCount);

    // Get deltas in seconds
    const deltaEpochEnd = campaignEndTimestamp.sub(nowBN);

    const campaignRewards = [];

    if (hasCampaignStarted) {
      // Get rewards info
      for (let i = 0; i < rewardsCountNum; i++) {
        const tokenAddress = await campaignContract.rewardsTokens(i);
        const rewardPerSecond = await campaignContract.rewardPerSecond(i);
        const totalRewards = rewardPerSecond.mul(epochDuration);

        campaignRewards.push({
          tokenAddress,
          rewardPerSecond,
          totalRewards,
        });
      }
    }

    const hasCampaignEnded = campaignEndTimestamp.lt(nowBN);
    const hasContractStakeLimit = !checkMaxStakingLimit(contractStakeLimit);
    const hasWalletStakeLimit = !checkMaxStakingLimit(walletStakeLimit);

    let rewardsDistributing = rewardsCount.gt(0) && hasCampaignStarted;
    for (let index = 0; index < rewardsCount.toNumber(); index++) {
      const rewardsPerSecond: BigNumber = await campaignContract.rewardPerSecond(index);

      rewardsDistributing = rewardsDistributing && rewardsPerSecond.gt(0);
    }

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
      rewardsCount: rewardsCountNum,
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
    const campaignContract = new Contract(
      campaignAddress,
      NonCompoundingRewardsPoolInfiniteABI,
      this.provider,
    );

    // Get now in seconds and convert to BN
    const now = Math.floor(Date.now() / 1000);
    const nowBN = BigNumber.from(now);

    // Get raw contract data
    const campaignEndTimestamp = await campaignContract.endTimestamp();
    const hasCampaignStarted = await campaignContract.hasStakingStarted();

    const hasCampaignEnded = campaignEndTimestamp.lt(nowBN);

    const tokensCount: BigNumber = await campaignContract.getRewardTokensCount();

    let rewardsDistributing = tokensCount.gt(0) && hasCampaignStarted;
    for (let index = 0; index < tokensCount.toNumber(); index++) {
      const rewardsPerSecond: BigNumber = await campaignContract.rewardPerSecond(index);

      rewardsDistributing = rewardsDistributing && rewardsPerSecond.gt(0);
    }

    return {
      hasCampaignStarted,
      hasCampaignEnded,
      rewardsDistributing,
    };
  }

  /**
   * Stake in campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {string} amountToStake - Amount to stake
   * @return {object} transaction object
   */
  public async stake(
    contractAddress: string,
    stakeTokenAddress: string,
    amountToStake: string,
    signerProvider: JsonRpcSigner,
  ): Promise<providers.TransactionResponse> {
    const campaignContract = new Contract(
      contractAddress,
      NonCompoundingRewardsPoolInfiniteABI,
      signerProvider,
    );

    const stakeTokenAmountInBN = await parseToken(
      this.provider as JsonRpcProvider,
      amountToStake,
      stakeTokenAddress,
    );

    const transaction = await campaignContract.stake(stakeTokenAmountInBN);

    return transaction;
  }

  /**
   * Exit from campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {object} transaction object
   */
  public async exit(
    contractAddress: string,
    signerProvider: JsonRpcSigner,
  ): Promise<providers.TransactionResponse> {
    const campaignContract = new Contract(
      contractAddress,
      NonCompoundingRewardsPoolInfiniteABI,
      signerProvider,
    );

    const transaction = await campaignContract.exit();

    return transaction;
  }
}

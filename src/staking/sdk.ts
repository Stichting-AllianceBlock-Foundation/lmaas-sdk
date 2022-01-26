import { FunctionFragment } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { parseEther } from '@ethersproject/units';

import {
  CampaingData,
  CampaingStatusData,
  CampaingStatusDataActive,
  checkMaxStakingLimit,
  NetworkEnum,
  UserDataStaking,
} from '..';
import NonCompoundingRewardsPool from '../abi/NonCompoundingRewardsPool.json';

export class StakerSolo {
  // TODO: Get network by provider (build pattern, async) !!
  protected protocol: NetworkEnum;
  protected provider: Web3Provider;

  constructor(provider: Web3Provider, protocol: NetworkEnum) {
    this.provider = provider;
    this.protocol = protocol;
  }

  /**
   * Get campaign data
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {CampaingData} CampaingData object
   */
  public async getCampaignData(campaignAddress: string): Promise<CampaingData> {
    const campaignContract = new Contract(
      campaignAddress,
      NonCompoundingRewardsPool,
      this.provider
    );

    // Get now in seconds and convert to BN
    const now = Math.floor(Date.now() / 1000);
    const nowBN = BigNumber.from(now);

    // Get raw contract data
    const {
      totalStaked: totalStakedPR,
      startTimestamp: startTimestampPR,
      endTimestamp: endTimestampPR,
      hasStakingStarted: hasStakingStartedPR,
      contractStakeLimit: contractStakeLimitPR,
      stakeLimit: stakeLimitPR,
      getRewardTokensCount: getRewardTokensCountPR,
    } = campaignContract;

    const promiseArray = [
      totalStakedPR(),
      startTimestampPR(),
      endTimestampPR(),
      hasStakingStartedPR(),
      contractStakeLimitPR(),
      stakeLimitPR(),
      getRewardTokensCountPR(),
    ];

    const [
      totalStaked,
      campaignStartTimestamp,
      campaignEndTimestamp,
      hasCampaignStarted,
      contractStakeLimit,
      walletStakeLimit,
      rewardsCount,
    ] = await Promise.all(promiseArray);

    const rewardsCountNum = Number(rewardsCount);

    // Get deltas in seconds
    const deltaExpiration = campaignEndTimestamp.sub(nowBN);
    const deltaDuration = campaignEndTimestamp.sub(campaignStartTimestamp);

    const campaignRewards = [];

    // Get rewards info
    for (let i = 0; i < rewardsCountNum; i++) {
      const tokenAddress = await campaignContract.rewardsTokens(i);
      const rewardPerSecond = await campaignContract.rewardPerSecond(i);
      const totalRewards = rewardPerSecond.mul(deltaDuration);

      campaignRewards.push({
        tokenAddress,
        rewardPerSecond,
        totalRewards,
      });
    }

    const hasCampaignEnded = campaignEndTimestamp.lt(nowBN);
    const hasContractStakeLimit = !checkMaxStakingLimit(contractStakeLimit);
    const hasWalletStakeLimit = !checkMaxStakingLimit(walletStakeLimit);

    return {
      totalStaked,
      hasCampaignStarted,
      hasCampaignEnded,
      campaignStartTimestamp,
      campaignEndTimestamp,
      contractStakeLimit,
      walletStakeLimit,
      hasContractStakeLimit,
      hasWalletStakeLimit,
      deltaExpiration,
      deltaDuration,
      campaignRewards,
      rewardsCount: rewardsCountNum,
    };
  }

  /**
   * Get campaign data
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {CampaingStatusData} CampaingStatusData object
   */
  public async getCampaignStatus(campaignAddress: string): Promise<CampaingStatusData> {
    const campaignContract = new Contract(
      campaignAddress,
      NonCompoundingRewardsPool,
      this.provider
    );

    // Get now in seconds and convert to BN
    const now = Math.floor(Date.now() / 1000);
    const nowBN = BigNumber.from(now);

    // Get raw contract data
    const campaignEndTimestamp = await campaignContract.endTimestamp();
    const hasCampaignStarted = await campaignContract.hasStakingStarted();

    const hasCampaignEnded = campaignEndTimestamp.lt(nowBN);

    return {
      hasCampaignStarted,
      hasCampaignEnded,
    };
  }

  /**
   * Get campaign data for connected user
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {CampaingStatusData} CampaingStatusData object
   */
  public async getCampaignStatusActive(campaignAddress: string): Promise<CampaingStatusDataActive> {
    const signer = this.provider.getSigner();
    const walletAddress = await signer.getAddress();

    const campaignContract = new Contract(campaignAddress, NonCompoundingRewardsPool, signer);

    // Get now in seconds and convert to BN
    const now = Math.floor(Date.now() / 1000);
    const nowBN = BigNumber.from(now);

    // Get raw contract data
    const campaignEndTimestamp = await campaignContract.endTimestamp();
    const hasCampaignStarted = await campaignContract.hasStakingStarted();
    const { exitTimestamp, exitStake } = await campaignContract.exitInfo(walletAddress);

    const hasCampaignEnded = campaignEndTimestamp.lt(nowBN);

    return {
      hasCampaignStarted,
      hasCampaignEnded,
      exitTimestamp,
      exitStake,
    };
  }

  /**
   * Get user data
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {UserData} UserData object
   */
  public async getUserData(campaignAddress: string): Promise<UserDataStaking> {
    const signer = this.provider.getSigner();
    const walletAddress = await signer.getAddress();

    // Get now in seconds and convert to BN
    const now = Math.floor(Date.now() / 1000);
    const zeroBN = BigNumber.from(0);

    const campaignContract = new Contract(campaignAddress, NonCompoundingRewardsPool, signer);

    // Get raw user data
    const { exitTimestamp, exitStake } = await campaignContract.exitInfo(walletAddress);
    const userBalance = await campaignContract.balanceOf(walletAddress);

    const hasUserInitiatedWithdraw = exitTimestamp.gt(zeroBN);

    const userStakedAmount = hasUserInitiatedWithdraw ? exitStake : userBalance;

    const rewardsCount = 1;
    const userRewards = [];

    if (userStakedAmount.gt(zeroBN)) {
      for (let i = 0; i < rewardsCount; i++) {
        const tokenAddress = await campaignContract.rewardsTokens(i);
        const currentAmount = !hasUserInitiatedWithdraw
          ? await campaignContract.getUserAccumulatedReward(walletAddress, i, now)
          : await campaignContract.getPendingReward(i);

        userRewards.push({
          tokenAddress,
          currentAmount,
        });
      }
    }

    return {
      exitTimestamp,
      exitStake,
      userStakedAmount,
      userRewards,
    };
  }

  /**
   * Stake in campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {string} amountToStake - Amount to stake
   * @return {object} transaction object
   */
  public async stake(contractAddress: string, amountToStake: string): Promise<FunctionFragment> {
    const signer = this.provider.getSigner();
    const campaignContract = new Contract(contractAddress, NonCompoundingRewardsPool, signer);
    const amountToStakeParsed = parseEther(amountToStake);

    const transaction = await campaignContract.stake(amountToStakeParsed);

    return transaction;
  }

  /**
   * Exit from campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {object} transaction object
   */
  public async exit(contractAddress: string): Promise<FunctionFragment> {
    const signer = this.provider.getSigner();
    const campaignContract = new Contract(contractAddress, NonCompoundingRewardsPool, signer);

    const transaction = await campaignContract.exit();

    return transaction;
  }
}

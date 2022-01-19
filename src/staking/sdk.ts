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
  UserRewards,
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
    const totalStaked = await campaignContract.totalStaked();
    const campaignStartTimestamp = await campaignContract.startTimestamp();
    const campaignEndTimestamp = await campaignContract.endTimestamp();
    const hasCampaignStarted = await campaignContract.hasStakingStarted();
    const contractStakeLimit = await campaignContract.contractStakeLimit();
    const walletStakeLimit = await campaignContract.stakeLimit();
    const rewardsCount = Number(await campaignContract.getRewardTokensCount());

    // Get deltas in seconds
    const deltaExpiration = campaignEndTimestamp.sub(nowBN);
    const deltaDuration = campaignEndTimestamp.sub(campaignStartTimestamp);

    const campaignRewards = [];

    // Get rewards info
    for (let i = 0; i < rewardsCount; i++) {
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
      rewardsCount,
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
    const { exitTimestamp, exitStake } = await campaignContract.exitInfo(walletAddress);

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

    const campaignContract = new Contract(campaignAddress, NonCompoundingRewardsPool, signer);

    // Get raw user data
    const { exitTimestamp, exitStake } = await campaignContract.exitInfo(walletAddress);

    return {
      exitTimestamp,
      exitStake,
    };
  }

  /**
   * Get user rewards data based on state
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {number} state - State of the campaign
   * @return {UserRewards[]} UserRewards object array
   */
  public async getUserRewards(campaignAddress: string, state: number): Promise<UserRewards[]> {
    const signer = this.provider.getSigner();
    const walletAddress = await signer.getAddress();

    const campaignContract = new Contract(campaignAddress, NonCompoundingRewardsPool, signer);

    const rewardsCount = 1;

    const userRewards = [];
    const now = Math.floor(Date.now() / 1000);

    for (let i = 0; i < rewardsCount; i++) {
      const tokenAddress = await campaignContract.rewardsTokens(i);
      const currentAmount =
        state <= 1
          ? await campaignContract.getUserAccumulatedReward(walletAddress, i, now)
          : await campaignContract.getPendingReward(i);

      userRewards.push({
        tokenAddress,
        currentAmount,
      });
    }

    return userRewards;
  }

  /**
   * Get user staked amount based on state
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {number} state - State of the campaign
   * @return {BigNumber} Rewards amount in BigNumber
   */
  public async getUserStakedAmount(campaignAddress: string, state: number): Promise<BigNumber> {
    const signer = this.provider.getSigner();
    const walletAddress = await signer.getAddress();

    const campaignContract = new Contract(campaignAddress, NonCompoundingRewardsPool, signer);

    const { exitStake } = await campaignContract.exitInfo(walletAddress);
    const userBalance = await campaignContract.balanceOf(walletAddress);

    const userStakedAmount = state <= 1 ? userBalance : exitStake;

    return userStakedAmount;
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

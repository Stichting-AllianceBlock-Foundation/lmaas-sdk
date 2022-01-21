import { FunctionFragment } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { parseEther } from '@ethersproject/units';

import {
  CampaingData,
  CampaingStatusData,
  checkMaxStakingLimit,
  NetworkEnum,
  UserDataLM,
} from '..';
import LiquidityMiningCampaignABI from '../abi/LiquidityMiningCampaign.json';

export class StakerLM {
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
      LiquidityMiningCampaignABI,
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
  public async getCampaignStatus(
    campaignAddress: string,
    active: boolean
  ): Promise<CampaingStatusData> {
    const campaignContract = new Contract(
      campaignAddress,
      LiquidityMiningCampaignABI,
      this.provider
    );

    // Get now in seconds and convert to BN
    const now = Math.floor(Date.now() / 1000);
    const nowBN = BigNumber.from(now);

    // Get raw contract data
    const campaignEndTimestamp = await campaignContract.endTimestamp();
    const hasCampaignStarted = await campaignContract.hasStakingStarted();

    const hasCampaignEnded = campaignEndTimestamp.lt(nowBN);

    let hasUserStaked = false;

    if (active) {
      const signer = this.provider.getSigner();
      const walletAddress = await signer.getAddress();

      const userStakedAmount = await campaignContract.balanceOf(walletAddress);

      hasUserStaked = userStakedAmount.gt(0);
    }

    return {
      hasCampaignStarted,
      hasCampaignEnded,
      hasUserStaked,
    };
  }

  /**
   * Get user data
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {UserData} UserData object
   */
  public async getUserData(campaignAddress: string): Promise<UserDataLM> {
    const signer = this.provider.getSigner();
    const walletAddress = await signer.getAddress();

    const campaignContract = new Contract(campaignAddress, LiquidityMiningCampaignABI, signer);

    // Get raw user data
    const userStakedAmount = await campaignContract.balanceOf(walletAddress);
    const rewardsCount = Number(await campaignContract.getRewardTokensCount());

    const hasUserStaked = userStakedAmount.gt(0);

    const userRewards = [];
    const now = Math.floor(Date.now() / 1000);

    // Get rewards info
    if (hasUserStaked) {
      for (let i = 0; i < rewardsCount; i++) {
        const tokenAddress = await campaignContract.rewardsTokens(i);
        const currentAmount = await campaignContract.getUserAccumulatedReward(
          walletAddress,
          i,
          now
        );

        userRewards.push({
          tokenAddress,
          currentAmount,
        });
      }
    }

    return {
      userStakedAmount,
      hasUserStaked,
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
    const campaignContract = new Contract(contractAddress, LiquidityMiningCampaignABI, signer);
    const amountToStakeParsed = parseEther(amountToStake);

    const transaction = await campaignContract.stake(amountToStakeParsed);

    return transaction;
  }

  /**
   * Exit from campaign (Claim & Withdraw)
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {object} transaction object
   */
  public async exit(contractAddress: string): Promise<FunctionFragment> {
    const signer = this.provider.getSigner();
    const campaignContract = new Contract(contractAddress, LiquidityMiningCampaignABI, signer);

    const transaction = await campaignContract.exit();

    return transaction;
  }

  /**
   * Claim rewards
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {object} transaction object
   */
  public async claim(contractAddress: string): Promise<FunctionFragment> {
    const signer = this.provider.getSigner();
    const campaignContract = new Contract(contractAddress, LiquidityMiningCampaignABI, signer);

    const transaction = await campaignContract.claim();

    return transaction;
  }
}

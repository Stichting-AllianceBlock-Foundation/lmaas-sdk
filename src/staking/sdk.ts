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
  TransactionResponse,
  UserDataStaking,
} from '..';
import NonCompoundingRewardsPool from '../abi/NonCompoundingRewardsPool.json';

/**
 *  Represents a class that can interact with SoloStaker's campaigns
 *  depending on the network.
 *  @constructor
 *  @param {JsonRpcBatchProvider | Web3Provider} provider - Provider with the global interaction.
 *  @param {NetworkEnum} protocol - Name of the network where this class is being used.
 */
export class StakerSolo {
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
      this.provider,
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
      name: namePR,
      wrappedNativeToken: wrappedNativeTokenPR,
    } = campaignContract;

    let wrappedNativeToken: string = '';

    /*
     @REMOVE this when the version of the pool is fixed.
     Some saving, because there are pools already deployed of v2.
    */
    try {
      wrappedNativeToken = await wrappedNativeTokenPR();
    } catch (e) {
      console.error(e);
    }

    const promiseArray = [
      totalStakedPR(),
      startTimestampPR(),
      endTimestampPR(),
      hasStakingStartedPR(),
      contractStakeLimitPR(),
      stakeLimitPR(),
      getRewardTokensCountPR(),
      namePR(),
    ];

    const [
      totalStaked,
      campaignStartTimestamp,
      campaignEndTimestamp,
      hasCampaignStarted,
      contractStakeLimit,
      walletStakeLimit,
      rewardsCount,
      name,
    ] = await Promise.all(promiseArray);

    const rewardsCountNum = Number(rewardsCount);

    // Get deltas in seconds
    const deltaExpiration = campaignEndTimestamp.sub(nowBN);
    const deltaDuration = campaignEndTimestamp.sub(campaignStartTimestamp);

    const campaignRewards = [];

    if (hasCampaignStarted) {
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
      name,
      wrappedNativeToken,
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
      this.provider,
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
    const rewardsCount = Number(await campaignContract.getRewardTokensCount());

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
   * @param {boolean} isNativeSupported - Switch to stake native tokens
   * @return {object} transaction object
   */
  public async stake(
    contractAddress: string,
    amountToStake: string,
    isNativeSupported: boolean,
  ): Promise<TransactionResponse> {
    const signer = this.provider.getSigner();
    const campaignContract = new Contract(contractAddress, NonCompoundingRewardsPool, signer);
    const amountToStakeParsed = parseEther(amountToStake);

    if (isNativeSupported)
      return await campaignContract.stakeNative({
        value: amountToStakeParsed,
      });

    return await campaignContract.stake(amountToStakeParsed);
  }

  /**
   * Exit from campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {object} transaction object
   */
  public async exit(contractAddress: string): Promise<TransactionResponse> {
    const signer = this.provider.getSigner();
    const campaignContract = new Contract(contractAddress, NonCompoundingRewardsPool, signer);

    const transaction = await campaignContract.exit();

    return transaction;
  }

  /**
   * Complete exit from campaign (take initial staking and rewards)
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {object} transaction object
   */
  public async completeExit(contractAddress: string): Promise<TransactionResponse> {
    const signer = this.provider.getSigner();
    const campaignContract = new Contract(contractAddress, NonCompoundingRewardsPool, signer);

    const transaction = await campaignContract.completeExit();

    return transaction;
  }
}

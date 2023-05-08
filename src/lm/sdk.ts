import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import { parseUnits } from '@ethersproject/units';
import { providers } from 'ethers';

import {
  CampaingData,
  CampaingStatusData,
  checkMaxStakingLimit,
  getTokenDecimals,
  NetworkEnum,
  UserDataLM,
} from '..';
import LiquidityMiningCampaignABI from '../abi/LiquidityMiningCampaign.json';
import LiquidityMiningCampaignTierABI from '../abi/LiquidityMiningCampaignTier.json';

/**
 *  Represents a class that can interact with LMC's
 *  depending on the network.
 *  @constructor
 *  @param {JsonRpcBatchProvider | JsonRpcProvider} provider - Provider with the global interaction.
 *  @param {NetworkEnum} protocol - Name of the network where this class is being used.
 */
export class StakerLM {
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
  public async getCampaignData(campaignAddress: string): Promise<CampaingData> {
    const campaignContract = new Contract(
      campaignAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    // Get now in seconds and convert to BN
    const now = Math.floor(Date.now() / 1000);
    const nowBN = BigNumber.from(now);

    const {
      totalStaked: totalStakedPR,
      startTimestamp: startTimestampPR,
      endTimestamp: endTimestampPR,
      hasStakingStarted: hasStakingStartedPR,
      contractStakeLimit: contractStakeLimitPR,
      stakeLimit: stakeLimitPR,
      extensionDuration: extensionDurationPR,
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
      /*
        Not printing the error, for the different versions of the campaigns
        being around of the ecosystem.
      */
    }

    const promiseArray = [
      totalStakedPR(),
      startTimestampPR(),
      endTimestampPR(),
      hasStakingStartedPR(),
      contractStakeLimitPR(),
      stakeLimitPR(),
      extensionDurationPR(),
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
      extensionDuration,
      rewardsCount,
      name,
    ] = await Promise.all(promiseArray);

    const rewardsCountNum = Number(rewardsCount);

    // Get deltas in seconds
    const deltaExpiration = campaignEndTimestamp.sub(nowBN);
    const deltaDuration = campaignEndTimestamp.sub(campaignStartTimestamp);

    const campaignRewards = [];

    const upcoming = Number(campaignStartTimestamp) > Math.floor(Date.now() / 1000);

    // Get rewards info
    if (hasCampaignStarted || upcoming) {
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
      extensionDuration,
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
  public async getCampaignStatus(
    campaignAddress: string,
    active: boolean,
    signerProvider: JsonRpcSigner,
  ): Promise<CampaingStatusData> {
    const campaignContract = new Contract(
      campaignAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    // Get now in seconds and convert to BN
    const now = Math.floor(Date.now() / 1000);
    const nowBN = BigNumber.from(now);

    // Get raw contract data
    const campaignStartTimestamp = await campaignContract.startTimestamp();
    const campaignEndTimestamp = await campaignContract.endTimestamp();
    const hasCampaignStarted = await campaignContract.hasStakingStarted();

    const hasCampaignEnded = hasCampaignStarted ? campaignEndTimestamp.lt(nowBN) : false;

    const upcoming = Number(campaignStartTimestamp) > now;

    let hasUserStaked = false;

    if (active) {
      const walletAddress = await signerProvider.getAddress();
      const userStakedAmount = await campaignContract.balanceOf(walletAddress);
      hasUserStaked = userStakedAmount.gt(0);
    }

    return {
      hasCampaignStarted,
      hasCampaignEnded,
      hasUserStaked,
      upcoming,
    };
  }

  /**
   * Get user data
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {UserData} UserData object
   */
  public async getUserData(
    campaignAddress: string,
    signerProvider: JsonRpcSigner,
  ): Promise<UserDataLM> {
    const walletAddress = await signerProvider.getAddress();

    const campaignContract = new Contract(
      campaignAddress,
      LiquidityMiningCampaignABI,
      signerProvider,
    );

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
          now,
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
  public async stake(
    contractAddress: string,
    amountToStake: string,
    signerProvider: JsonRpcSigner,
    isNativeSupported = false,
  ): Promise<providers.TransactionResponse> {
    const campaignContract = new Contract(
      contractAddress,
      LiquidityMiningCampaignABI,
      signerProvider,
    );

    const stakingToken = await campaignContract.stakingToken();
    const tokenDecimals = await getTokenDecimals(signerProvider, stakingToken);
    const amountToStakeParsed = parseUnits(amountToStake, tokenDecimals);

    if (isNativeSupported) {
      return await campaignContract.stakeNative({
        value: amountToStakeParsed,
      });
    }

    return await campaignContract.stake(amountToStakeParsed);
  }

  /**
   * Stake in tier campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {string} amountToStake - Amount to stake
   * @param {string} signature - Signature provided for the tier campaign
   * @param {number} maxTier - Max tier for the user
   * @param {number} deadline - Deadline for the signature to be over
   * @return {object} transaction object
   */
  public async stakeWithTier(
    contractAddress: string,
    amountToStake: string,
    signature: string,
    maxTier: number,
    deadline: number,
    signerProvider: JsonRpcSigner,
  ): Promise<providers.TransactionResponse> {
    const campaignContract = new Contract(
      contractAddress,
      LiquidityMiningCampaignTierABI,
      signerProvider,
    );

    const stakingToken = await campaignContract.stakingToken();
    const tokenDecimals = await getTokenDecimals(signerProvider, stakingToken);
    const amountToStakeParsed = parseUnits(amountToStake, tokenDecimals);

    const transaction = await campaignContract.stakeWithTier(
      amountToStakeParsed,
      signature,
      maxTier,
      deadline,
    );

    return transaction;
  }

  /**
   * Exit from campaign (Claim & Withdraw)
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
      LiquidityMiningCampaignABI,
      signerProvider,
    );

    const transaction = await campaignContract.exit();

    return transaction;
  }

  /**
   * Claim rewards
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {object} transaction object
   */
  public async claim(
    contractAddress: string,
    signerProvider: JsonRpcSigner,
  ): Promise<providers.TransactionResponse> {
    const campaignContract = new Contract(
      contractAddress,
      LiquidityMiningCampaignABI,
      signerProvider,
    );

    const transaction = await campaignContract.claim();

    return transaction;
  }

  /**
   * Extend campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {number} duration - Duration of the campaign in seconds
   * @param {string} rewardsPerSecond - Rewards per second in string
   * @return {object} transaction object
   */
  public async extend(
    contractAddress: string,
    duration: number,
    rewardsPerSecond: string,
    signerProvider: JsonRpcSigner,
  ): Promise<providers.TransactionResponse> {
    const campaignContract = new Contract(
      contractAddress,
      LiquidityMiningCampaignABI,
      signerProvider,
    );

    const stakingToken = await campaignContract.stakingToken();
    const tokenDecimals = await getTokenDecimals(signerProvider, stakingToken);
    const rewardsPerSecondParsed = parseUnits(rewardsPerSecond, tokenDecimals);

    const transaction = await campaignContract.extend(duration, [rewardsPerSecondParsed]);

    return transaction;
  }
}

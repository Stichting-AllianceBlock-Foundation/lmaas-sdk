import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { ContractTransaction } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { parseEther } from '@ethersproject/units';
import {NonCompoundingRewardsPool, NonCompoundingRewardsPool__factory} from 'lmaas-contracts/typechain-types';

import {
  CampaingData,
  CampaingStatusData,
  CampaingStatusDataActive,
  checkMaxStakingLimit,
  NetworkEnum,
  UserDataStaking,
} from '..';

export class StakerSolo {
  // TODO: Get network by provider (build pattern, async) !!
  protected protocol: NetworkEnum;
  protected provider: Web3Provider;

  constructor(provider: Web3Provider, protocol: NetworkEnum) {
    this.provider = provider;
    this.protocol = protocol;
  }

  protected getContract = (address: string): NonCompoundingRewardsPool => {
    return NonCompoundingRewardsPool__factory.connect(address, this.provider);
  }

  /**
   * Deploy a new pool
   * @public
   * @param {string} stakingToken - Address of the token to stake
   * @param {string} rewardsTokens - Addresses of the reward tokens
   * @param {string} stakeLimit - Staking limit per user
   * @param {string} throttleRoundSeconds - Duration of throttling round in seconds
   * @param {string} throttleRoundCap - Max withdrawal per throttling round
   * @param {string} contractStakeLimit - Total staking limitcontract
   * @param {string} name - Name of the pool
   * @return {CampaingData} CampaingData object
   */
  public async deploy (
    stakingToken: string, 
    rewardsTokens: string[], 
    stakeLimit: BigNumberish, 
    throttleRoundSeconds: BigNumberish, 
    throttleRoundCap: BigNumberish, 
    contractStakeLimit: BigNumberish, 
    name: string
  ): Promise<string> {
    const factory = new NonCompoundingRewardsPool__factory(this.provider.getSigner());

    const contract = await factory.deploy(
      stakingToken,
      rewardsTokens,
      stakeLimit,
      throttleRoundSeconds,
      throttleRoundCap,
      contractStakeLimit,
      name
    );

    return contract.address;
  }

  /**
   * Get campaign data
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {CampaingData} CampaingData object
   */
  public async getCampaignData(campaignAddress: string): Promise<CampaingData> {
    const campaignContract = this.getContract(campaignAddress);

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
    const campaignContract = this.getContract(campaignAddress);

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

    const campaignContract = this.getContract(campaignAddress);

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

    const campaignContract = this.getContract(campaignAddress);

    // Get raw user data
    const { exitTimestamp, exitStake } = await campaignContract.exitInfo(walletAddress);
    const userBalance = await campaignContract.balanceOf(walletAddress);

    const hasUserInitiatedWithdraw = exitTimestamp.gt(zeroBN);

    const userStakedAmount = hasUserInitiatedWithdraw ? exitStake : userBalance;

    const rewardsCount = 1;
    const userRewards = [];

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
  public async stake(contractAddress: string, amountToStake: string): Promise<ContractTransaction> {
    const campaignContract = this.getContract(contractAddress);

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
  public async exit(contractAddress: string): Promise<ContractTransaction> {
    const campaignContract = this.getContract(contractAddress);

    const transaction = await campaignContract.exit();

    return transaction;
  }

  /**
   * Transfer ownership
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {string} newOwner - Address of the new owner
   * @return {object} transaction object
   */
  public async transferOwnership(contractAddress: string, newOwner: string): Promise<ContractTransaction> {
    const campaignContract = this.getContract(contractAddress);

    const transaction = await campaignContract.transferOwnership(newOwner);

    return transaction;
  }
}

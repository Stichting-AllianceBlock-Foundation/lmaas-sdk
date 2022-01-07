import { FunctionFragment } from '@ethersproject/abi';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { parseEther } from '@ethersproject/units';

import { CampaingData, checkMaxStakingLimit, NetworkEnum, UserData } from '..';
import LiquidityMiningCampaignABI from '../abi/LiquidityMiningCampaign.json';

export class SDKLm {
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

    // Get current block
    const currentBlockNumber = (await this.provider.getBlock('latest')).number;

    // Get raw contract data
    const totalStaked = await campaignContract.totalStaked();
    const campaignStartBlock = await campaignContract.startBlock();
    const campaignEndBlock = await campaignContract.endBlock();
    const hasCampaignStarted = await campaignContract.hasStakingStarted();
    const contractStakeLimit = await campaignContract.contractStakeLimit();
    const walletStakeLimit = await campaignContract.stakeLimit();
    const rewardsCount = await campaignContract.getRewardTokensCount();

    // Get deltas in blocks
    const deltaExpirationBlocks = campaignEndBlock.sub(currentBlockNumber);
    const deltaDurationBlocks = campaignEndBlock.sub(campaignStartBlock);

    const campaignRewards = [];

    // Get rewards info
    for (let i = 0; i < rewardsCount.toNumber(); i++) {
      const tokenAddress = await campaignContract.rewardsTokens(i);
      const rewardPerBlock = await campaignContract.rewardPerBlock(i);
      const totalRewards = rewardPerBlock.mul(deltaDurationBlocks);

      campaignRewards.push({
        tokenAddress,
        rewardPerBlock,
        totalRewards,
      });
    }

    const hasCampaignEnded = deltaExpirationBlocks.lt(0);
    const hasContractStakeLimit = !checkMaxStakingLimit(contractStakeLimit);
    const hasWalletStakeLimit = !checkMaxStakingLimit(walletStakeLimit);

    return {
      totalStaked,
      hasCampaignStarted,
      hasCampaignEnded,
      campaignStartBlock,
      campaignEndBlock,
      contractStakeLimit,
      walletStakeLimit,
      hasContractStakeLimit,
      hasWalletStakeLimit,
      deltaExpirationBlocks,
      deltaDurationBlocks,
      campaignRewards,
    };
  }

  /**
   * Get user data
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {UserData} UserData object
   */
  public async getUserData(campaignAddress: string): Promise<UserData> {
    const signer = this.provider.getSigner();
    const walletAddress = await signer.getAddress();

    const campaignContract = new Contract(campaignAddress, LiquidityMiningCampaignABI, signer);

    // Get raw user data
    const userStakedAmount = await campaignContract.balanceOf(walletAddress);
    const rewardsCount = await campaignContract.getRewardTokensCount();

    const hasUserStaked = userStakedAmount.gt(0);

    const userRewards = [];

    // Get rewards info
    if (hasUserStaked) {
      for (let i = 0; i < rewardsCount.toNumber(); i++) {
        const tokenAddress = await campaignContract.rewardsTokens(i);
        const currentAmount = await campaignContract.getUserAccumulatedReward(walletAddress, i);

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

    const campaignAddress = new Contract(contractAddress, LiquidityMiningCampaignABI, signer);

    const amountToStakeParsed = parseEther(amountToStake);

    const transaction = await campaignAddress.stake(amountToStakeParsed);

    return transaction;
  }

  /**
   * Withdraw from campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @return {object} transaction object
   */
  public async withdraw(contractAddress: string): Promise<FunctionFragment> {
    const signer = this.provider.getSigner();

    const stakingRewardsContract = new Contract(
      contractAddress,
      LiquidityMiningCampaignABI,
      signer
    );

    const transaction = await stakingRewardsContract.exitAndUnlock();

    return transaction;
  }
}

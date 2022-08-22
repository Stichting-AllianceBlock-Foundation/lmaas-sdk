import { FunctionFragment } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcBatchProvider, JsonRpcSigner, Web3Provider } from '@ethersproject/providers';
import { formatEther, formatUnits, parseEther } from '@ethersproject/units';

import {
  BLOCKS_COUNT,
  checkMaxStakingLimit,
  convertBlockToSeconds,
  getAddressFromWallet,
  getTokenByPropName,
} from '..';
import LiquidityMiningCampaignABI from '../abi/LiquidityMiningCampaignV1.json';
import { CampaignRewards, NetworkEnum, Reward, TokenConfigs, TokenConfigsProps } from '../entities';

export class ALBStaker {
  provider: Web3Provider | JsonRpcBatchProvider;
  protocol: NetworkEnum;
  [key: string]: any;

  constructor(provider: Web3Provider | JsonRpcBatchProvider, protocol: NetworkEnum) {
    this.provider = provider;
    this.protocol = protocol;
  }

  /**
   * Stake in campaign
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @param {string} lockSchemeAddress - Address of the lock scheme
   * @param {string} amountToStake - amount to stake
   * @return {object} transaction object
   */
  async stake(
    userWallet: Web3Provider,
    stakingContractAddress: string,
    lockSchemeAddress: string,
    amountToStake: string,
  ): Promise<FunctionFragment> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      userWallet,
    );

    // shouldn't be an issue - pool's token is 18 decimals
    const amountToStakeBN = parseEther(amountToStake);

    return stakingRewardsContract.stakeAndLock(amountToStakeBN, lockSchemeAddress);
  }

  /**
   * Claim rewards (not currently used)
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {object} transaction object
   */
  async claimRewards(
    userWallet: Web3Provider,
    stakingContractAddress: string,
  ): Promise<FunctionFragment> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      userWallet,
    );
    return stakingRewardsContract.claim();
  }

  /**
   * Withdraw from campaign
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {object} transaction object
   */
  async withdraw(
    userWallet: Web3Provider,
    stakingContractAddress: string,
  ): Promise<FunctionFragment> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      userWallet,
    );
    return stakingRewardsContract.exitAndUnlock();
  }

  /**
   * Exit and stake into staking campaigns (not currently used)
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @param {string} stakerPoolAddress - Address of the staking campaign
   * @return {object} transaction object
   */
  async exitAndStake(
    userWallet: Web3Provider,
    stakingContractAddress: string,
    stakerPoolAddress: string,
  ): Promise<FunctionFragment> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      userWallet,
    );

    return stakingRewardsContract.exitAndStake(stakerPoolAddress);
  }

  /**
   * Get current reward
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @param {object} tokensConfig - Token config
   * @return {array} Array with rewards data
   */
  async getCurrentReward(
    userWallet: JsonRpcSigner,
    stakingContractAddress: string,
    tokensConfig: TokenConfigs,
  ): Promise<Reward[]> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    const rewardsCount = await stakingRewardsContract.getRewardTokensCount();
    const walletAddress = await getAddressFromWallet(userWallet);

    const currentRewards = [];

    // Very stupid check in order to not trow error if user is not staked...
    const userStakingBalance = await this.getStakingTokensBalance(
      userWallet,
      stakingContractAddress,
    );

    if (userStakingBalance === '0.0') {
      for (let i = 0; i < rewardsCount.toNumber(); i++) {
        const currentRewardToken = await stakingRewardsContract.rewardsTokens(i);
        const rewardsContractName = getTokenByPropName(
          tokensConfig,
          TokenConfigsProps.ADDRESS,
          currentRewardToken.toLowerCase(),
        ).symbol;

        const currentRewardObj = {
          tokenName: rewardsContractName,
          tokenAddress: currentRewardToken.toLowerCase(),
          tokenAmount: '0.0',
        };

        currentRewards.push(currentRewardObj);
      }

      // shouldn't be an issue - pool's token is 18 decimals
      return currentRewards;
    } else {
      for (let i = 0; i < rewardsCount.toNumber(); i++) {
        const currentRewardToken = await stakingRewardsContract.rewardsTokens(i);

        const currentReward = await stakingRewardsContract.getUserAccumulatedReward(
          walletAddress,
          i,
        );

        const { symbol: rewardsContractName, decimals: tokenDecimals } = getTokenByPropName(
          tokensConfig,
          TokenConfigsProps.ADDRESS,
          currentRewardToken.toLowerCase(),
        );

        const currentRewardObj = {
          tokenName: rewardsContractName,
          tokenAddress: currentRewardToken.toLowerCase(),
          tokenAmount: formatUnits(currentReward, tokenDecimals),
        };

        currentRewards.push(currentRewardObj);
      }

      // shouldn't be an issue - pool's token is 18 decimals
      return currentRewards;
    }
  }

  /**
   * Get staking token balance
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {string} Formatted user balance
   */
  async getStakingTokensBalance(
    userWallet: JsonRpcSigner,
    stakingContractAddress: string,
  ): Promise<string> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    const walletAddress = await getAddressFromWallet(userWallet);
    const balance = await stakingRewardsContract.balanceOf(walletAddress);

    // shouldn't be an issue - pool's token is 18 decimals
    return formatEther(balance.toString());
  }

  /**
   * Get total staked amount
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {BigNumber} Total staked amount
   */
  async getTotalStakedAmount(stakingContractAddress: string): Promise<BigNumber> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    return stakingRewardsContract.totalStaked();
  }

  /**
   * Get reward info
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @param {number} index - rewards token index
   * @return {BigNumber} Reward per block
   */
  async getRewardInfo(stakingContractAddress: string, index: number): Promise<BigNumber> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    return stakingRewardsContract.rewardPerBlock(index);
  }

  /**
   * Get reward count
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {number} Rewards number
   */
  async getRewardsCount(stakingContractAddress: string): Promise<number> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    return stakingRewardsContract.getRewardTokensCount();
  }

  /**
   * Get rewards address by index
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @param {number} index - rewards token index
   * @return {string} Reward address
   */
  async getRewardsAddressFromArray(stakingContractAddress: string, index: number): Promise<string> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    return stakingRewardsContract.rewardsTokens(index);
  }

  /**
   * Get total rewards amount
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @param {object} tokensConfig - token config
   * @return {array} Reward data array
   */
  async getTotalRewardsAmount(
    stakingContractAddress: string,
    tokensConfig: TokenConfigs,
  ): Promise<CampaignRewards> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    const rewardsCount = await stakingRewardsContract.getRewardTokensCount();

    let startBlock = stakingRewardsContract.startBlock();
    let endBlock = stakingRewardsContract.endBlock();

    const result = await Promise.all([startBlock, endBlock]);
    startBlock = result[0];
    endBlock = result[1];

    const durationInBlocks = endBlock.sub(startBlock);

    const campaignRewards: CampaignRewards = {
      total: [],
      weekly: [],
    };

    for (let i = 0; i < rewardsCount.toNumber(); i++) {
      const currentRewardToken = await stakingRewardsContract.rewardsTokens(i);
      const rewardPerBlock = await stakingRewardsContract.rewardPerBlock(i);

      const { symbol: tokenName, decimals: tokenDecimals } = getTokenByPropName(
        tokensConfig,
        TokenConfigsProps.ADDRESS,
        currentRewardToken.toLowerCase(),
      );

      const tokenAmount = formatUnits(rewardPerBlock.mul(durationInBlocks), tokenDecimals);

      const totalObj = {
        tokenName,
        tokenAddress: currentRewardToken.toLowerCase(),
        tokenAmount,
      };

      const weeklyObj = {
        tokenName,
        tokenAddress: currentRewardToken.toLowerCase(),
        tokenAmount: formatUnits(
          rewardPerBlock.mul(BLOCKS_COUNT[this.protocol].PER_WEEK),
          tokenDecimals,
        ),
      };

      campaignRewards.total.push(totalObj);
      campaignRewards.weekly.push(weeklyObj);
    }

    return campaignRewards;
  }

  /**
   * Check if campaign started
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {boolean}
   */
  async hasCampaignStarted(stakingContractAddress: string): Promise<boolean> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    return stakingRewardsContract.hasStakingStarted();
  }

  /**
   * Check if campaign ended
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {boolean}
   */
  async hasCampaignEnded(stakingContractAddress: string): Promise<boolean> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    const endBlock = await stakingRewardsContract.endBlock();
    const currentBlock = await this.provider.getBlock('latest');

    const delta = endBlock.sub(currentBlock.number);
    return delta.lt(0);
  }

  /**
   * Get contract staking limit
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {string} Staking limit
   */
  async getContractStakeLimit(stakingContractAddress: string): Promise<string> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    let contractStakeLimit;

    try {
      contractStakeLimit = await stakingRewardsContract.contractStakeLimit();
    } catch (e) {
      console.error(e);
    }

    return formatEther(contractStakeLimit.toString());
  }

  /**
   * Check contract has staking limit
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {boolean} Has Staking limit
   */
  async checkContractStakeLimit(stakingContractAddress: string): Promise<boolean> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    let hasContractStakeLimit = true;

    try {
      const contractStakeLimit = await stakingRewardsContract.contractStakeLimit();
      hasContractStakeLimit = !checkMaxStakingLimit(contractStakeLimit);
    } catch (e) {
      console.error(e);
    }

    return hasContractStakeLimit;
  }

  /**
   * Get wallet staking limit
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {string} Staking limit
   */
  async getUserStakeLimit(stakingContractAddress: string): Promise<string> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    let stakeLimit;

    try {
      stakeLimit = await stakingRewardsContract.stakeLimit();
    } catch (e) {
      console.error(e);
    }
    return formatEther(stakeLimit.toString());
  }

  /**
   * Check wallet has staking limit
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {boolean} Has Staking limit
   */
  async checkUserStakeLimit(stakingContractAddress: string): Promise<boolean> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    let hasUserStakeLimit = true;

    try {
      const stakeLimit = await stakingRewardsContract.stakeLimit();
      hasUserStakeLimit = !checkMaxStakingLimit(stakeLimit);
    } catch (e) {
      console.error(e);
    }
    return hasUserStakeLimit;
  }

  /**
   * Get campaign expiration and duration
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {object} Expiration and duration periods in milliseconds
   */
  async getExpirationAndDuration(
    stakingContractAddress: string,
  ): Promise<{ duration: number; expirationTime: number }> {
    const stakingRewardsContract = new Contract(
      stakingContractAddress,
      LiquidityMiningCampaignABI,
      this.provider,
    );

    const currentBlock = await this.provider.getBlock('latest');
    const startBlock = await stakingRewardsContract.startBlock();
    const endBlock = await stakingRewardsContract.endBlock();

    // Get duration period (from start to end block)
    const deltaDurationPeriod = endBlock.sub(startBlock);
    const durationPeriodInBlocks = deltaDurationPeriod.gt(0)
      ? deltaDurationPeriod
      : BigNumber.from(0);
    const durationInSeconds = await convertBlockToSeconds(durationPeriodInBlocks, this.protocol);
    const durationInMilliseconds = durationInSeconds.mul(1000).toNumber();

    const deltaExpirationPeriod = endBlock.sub(currentBlock.number);
    const expirationPeriodInBlocks = deltaExpirationPeriod.gt(0)
      ? deltaExpirationPeriod
      : BigNumber.from(0);
    const expirationInSeconds = await convertBlockToSeconds(
      expirationPeriodInBlocks,
      this.protocol,
    );
    const expirationInMilliseconds = expirationInSeconds.mul(1000).toNumber();

    return {
      duration: durationInMilliseconds,
      expirationTime: expirationInMilliseconds,
    };
  }

  /**
   * Get scheme info
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} address - Address of staking contract
   * @return {boolean} If user staked in campaign
   */
  async getUserStakedInCampaign(userWallet: any, address: string): Promise<boolean> {
    const stakingRewardsContract = new Contract(address, LiquidityMiningCampaignABI, this.provider);

    const walletAddress = await getAddressFromWallet(userWallet);
    const stakedAmount = await stakingRewardsContract.balanceOf(walletAddress);

    return stakedAmount.toBigInt() > 0;
  }
}

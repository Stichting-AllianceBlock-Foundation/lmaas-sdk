import { formatEther, formatUnits, parseEther, PublicClient, WalletClient } from 'viem';

import {
  BLOCKS_COUNT,
  checkMaxStakingLimit,
  convertBlockToSeconds,
  getAddressFromWallet,
  getTokenByPropName,
} from '..';
import { LiquidityMiningCampaignABI } from '../abi/LiquidityMiningCampaignV1';
import { CampaignRewards, NetworkEnum, Reward, TokenConfigs, TokenConfigsProps } from '../entities';

export class ALBStaker {
  provider: PublicClient;
  protocol: NetworkEnum;
  [key: string]: any;

  constructor(provider: PublicClient, protocol: NetworkEnum) {
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
    userWallet: WalletClient,
    stakingContractAddress: string,
    lockSchemeAddress: string,
    amountToStake: string,
  ): Promise<`0x${string}`> {
    const [address] = await userWallet.getAddresses();

    const { request } = await this.provider.simulateContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'stakeAndLock',
      account: address,
      args: [parseEther(amountToStake), lockSchemeAddress as `0x${string}`],
    });

    return userWallet.writeContract(request);
  }

  /**
   * Claim rewards (not currently used)
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {object} transaction object
   */
  async claimRewards(
    userWallet: WalletClient,
    stakingContractAddress: string,
  ): Promise<`0x${string}`> {
    const [address] = await userWallet.getAddresses();

    const { request } = await this.provider.simulateContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'claim',
      account: address,
    });

    return userWallet.writeContract(request);
  }

  /**
   * Withdraw from campaign
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {object} transaction object
   */
  async withdraw(userWallet: WalletClient, stakingContractAddress: string): Promise<`0x${string}`> {
    const [address] = await userWallet.getAddresses();

    const { request } = await this.provider.simulateContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'exitAndUnlock',
      account: address,
    });

    return userWallet.writeContract(request);
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
    userWallet: WalletClient,
    stakingContractAddress: string,
    stakerPoolAddress: string,
  ): Promise<`0x${string}`> {
    const [address] = await userWallet.getAddresses();

    const { request } = await this.provider.simulateContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'exitAndStake',
      account: address,
      args: [stakerPoolAddress as `0x${string}`],
    });

    return userWallet.writeContract(request);
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
    userWallet: WalletClient,
    stakingContractAddress: string,
    tokensConfig: TokenConfigs,
  ): Promise<Reward[]> {
    const stakingContractConfig = {
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      walletClient: userWallet,
    };

    const rewardsCount = await this.provider.readContract({
      ...stakingContractConfig,
      functionName: 'getRewardTokensCount',
    });

    const walletAddress = await getAddressFromWallet(userWallet);

    const currentRewards = [];

    // Very stupid check in order to not trow error if user is not staked...
    const userStakingBalance = await this.getStakingTokensBalance(
      userWallet,
      stakingContractAddress,
    );

    if (userStakingBalance === '0.0') {
      for (let i = 0n; i < rewardsCount; i++) {
        const currentRewardToken = await this.provider.readContract({
          ...stakingContractConfig,
          functionName: 'rewardsTokens',
          args: [i],
        });

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
      for (let i = 0n; i < rewardsCount; i++) {
        const currentRewardToken = await this.provider.readContract({
          ...stakingContractConfig,
          functionName: 'rewardsTokens',
          args: [i],
        });

        const currentReward = await this.provider.readContract({
          ...stakingContractConfig,
          functionName: 'getUserAccumulatedReward',
          args: [walletAddress, i],
          account: walletAddress,
        });

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
    userWallet: WalletClient,
    stakingContractAddress: string,
  ): Promise<string> {
    const walletAddress = await getAddressFromWallet(userWallet);
    const balance = await this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'balanceOf',
      args: [walletAddress],
    });

    // shouldn't be an issue - pool's token is 18 decimals
    return formatEther(balance);
  }

  /**
   * Get total staked amount
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {BigNumber} Total staked amount
   */
  async getTotalStakedAmount(stakingContractAddress: string): Promise<bigint> {
    return this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'totalStaked',
    });
  }

  /**
   * Get reward info
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @param {number} index - rewards token index
   * @return {BigNumber} Reward per block
   */
  async getRewardInfo(stakingContractAddress: string, index: number): Promise<bigint> {
    return this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'rewardPerBlock',
      args: [BigInt(index)],
    });
  }

  /**
   * Get reward count
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {number} Rewards number
   */
  async getRewardsCount(stakingContractAddress: string): Promise<bigint> {
    return this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'getRewardTokensCount',
    });
  }

  /**
   * Get rewards address by index
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @param {number} index - rewards token index
   * @return {string} Reward address
   */
  async getRewardsAddressFromArray(stakingContractAddress: string, index: number): Promise<string> {
    return this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'rewardsTokens',
      args: [BigInt(index)],
    });
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
    const rewardsCount = await this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'getRewardTokensCount',
    });

    let startBlock: bigint = 0n;
    let endBlock: bigint = 0n;

    const result = await Promise.all([
      this.provider.readContract({
        abi: LiquidityMiningCampaignABI,
        address: stakingContractAddress as `0x${string}`,
        functionName: 'startBlock',
      }),
      this.provider.readContract({
        abi: LiquidityMiningCampaignABI,
        address: stakingContractAddress as `0x${string}`,
        functionName: 'endBlock',
      }),
    ]);
    startBlock = result[0];
    endBlock = result[1];

    const durationInBlocks = endBlock - startBlock;

    const campaignRewards: CampaignRewards = {
      total: [],
      weekly: [],
    };

    for (let i = 0n; i < rewardsCount; i++) {
      const currentRewardToken = await this.provider.readContract({
        abi: LiquidityMiningCampaignABI,
        address: stakingContractAddress as `0x${string}`,
        functionName: 'rewardsTokens',
        args: [i],
      });
      const rewardPerBlock = await this.provider.readContract({
        abi: LiquidityMiningCampaignABI,
        address: stakingContractAddress as `0x${string}`,
        functionName: 'rewardPerBlock',
        args: [i],
      });

      const { symbol: tokenName, decimals: tokenDecimals } = getTokenByPropName(
        tokensConfig,
        TokenConfigsProps.ADDRESS,
        currentRewardToken.toLowerCase(),
      );

      const tokenAmount = formatUnits(rewardPerBlock * durationInBlocks, tokenDecimals);

      const totalObj = {
        tokenName,
        tokenAddress: currentRewardToken.toLowerCase(),
        tokenAmount,
      };

      const weeklyObj = {
        tokenName,
        tokenAddress: currentRewardToken.toLowerCase(),
        tokenAmount: formatUnits(
          rewardPerBlock * BigInt(BLOCKS_COUNT[this.protocol].PER_WEEK),
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
    return this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'hasStakingStarted',
    });
  }

  /**
   * Check if campaign ended
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {boolean}
   */
  async hasCampaignEnded(stakingContractAddress: string): Promise<boolean> {
    const endBlock = await this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'endBlock',
    });

    const currentBlock = await this.provider.getBlock();
    const delta = endBlock - (currentBlock.number ?? 0n);
    return delta < 0;
  }

  /**
   * Get contract staking limit
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {string} Staking limit
   */
  async getContractStakeLimit(stakingContractAddress: string): Promise<string> {
    const contractStakeLimit = await this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'contractStakeLimit',
    });

    return formatEther(contractStakeLimit);
  }

  /**
   * Check contract has staking limit
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {boolean} Has Staking limit
   */
  async checkContractStakeLimit(stakingContractAddress: string): Promise<boolean> {
    const contractStakeLimit = await this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'contractStakeLimit',
    });
    return !checkMaxStakingLimit(contractStakeLimit);
  }

  /**
   * Get wallet staking limit
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {string} Staking limit
   */
  async getUserStakeLimit(stakingContractAddress: string): Promise<string> {
    const stakeLimit = await this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'stakeLimit',
    });
    return formatEther(stakeLimit);
  }

  /**
   * Check wallet has staking limit
   * @public
   * @param {string} stakingContractAddress - Address of the camapaign contracts
   * @return {boolean} Has Staking limit
   */
  async checkUserStakeLimit(stakingContractAddress: string): Promise<boolean> {
    const stakeLimit = await this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'stakeLimit',
    });
    return !checkMaxStakingLimit(stakeLimit);
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
    const currentBlock = await this.provider.getBlock();
    const startBlock = await this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'startBlock',
    });
    const endBlock = await this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'endBlock',
    });

    // Get duration period (from start to end block)
    const deltaDurationPeriod = endBlock - startBlock;
    const durationPeriodInBlocks = deltaDurationPeriod > 0 ? deltaDurationPeriod : 0n;
    const durationInSeconds = await convertBlockToSeconds(durationPeriodInBlocks, this.protocol);
    const durationInMilliseconds = durationInSeconds * 1000n;
    const deltaExpirationPeriod = endBlock - BigInt(currentBlock.number ?? 0n);
    const expirationPeriodInBlocks = deltaExpirationPeriod > 0n ? deltaExpirationPeriod : 0n;
    const expirationInSeconds = await convertBlockToSeconds(
      expirationPeriodInBlocks,
      this.protocol,
    );
    const expirationInMilliseconds = expirationInSeconds * 1000n;

    return {
      duration: Number(durationInMilliseconds),
      expirationTime: Number(expirationInMilliseconds),
    };
  }

  /**
   * Get scheme info
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} address - Address of staking contract
   * @return {boolean} If user staked in campaign
   */
  async getUserStakedInCampaign(
    userWallet: WalletClient,
    stakingContractAddress: string,
  ): Promise<boolean> {
    const walletAddress = await getAddressFromWallet(userWallet);
    const stakedAmount = await this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: stakingContractAddress as `0x${string}`,
      functionName: 'balanceOf',
      args: [walletAddress],
    });

    return stakedAmount > 0;
  }
}

import { getContract, parseUnits, PublicClient, WalletClient } from 'viem';

import {
  CampaingData,
  CampaingStatusData,
  checkMaxStakingLimit,
  getAddressFromWallet,
  getTokenDecimals,
  NetworkEnum,
  UserDataLM,
} from '..';
import { LiquidityMiningCampaignABI } from '../abi/LiquidityMiningCampaign';
import { LiquidityMiningCampaignTierABI } from '../abi/LiquidityMiningCampaignTier';

/**
 *  Represents a class that can interact with LMC's
 *  depending on the network.
 *  @constructor
 *  @param {PublicClient} provider - Provider with the global interaction.
 *  @param {NetworkEnum} protocol - Name of the network where this class is being used.
 */
export class StakerLM {
  protected protocol: NetworkEnum;
  protected provider: PublicClient;

  constructor(provider: PublicClient, protocol: NetworkEnum) {
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
    const campaignContract = getContract({
      abi: LiquidityMiningCampaignABI,
      address: campaignAddress as `0x${string}`,
      publicClient: this.provider,
    });

    // Get now in seconds and convert to BN
    const now = BigInt(Math.floor(Date.now() / 1000));

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
    } = campaignContract.read;

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

    const name = await namePR();
    const hasCampaignStarted = await hasStakingStartedPR();

    const promiseArray = [
      totalStakedPR(),
      startTimestampPR(),
      endTimestampPR(),
      contractStakeLimitPR(),
      stakeLimitPR(),
      extensionDurationPR(),
      getRewardTokensCountPR(),
    ];

    const [
      totalStaked,
      campaignStartTimestamp,
      campaignEndTimestamp,
      contractStakeLimit,
      walletStakeLimit,
      extensionDuration,
      rewardsCount,
    ] = await Promise.all(promiseArray);

    // Get deltas in seconds
    const deltaExpiration = campaignEndTimestamp - now;
    const deltaDuration = campaignEndTimestamp - campaignStartTimestamp;

    const campaignRewards = [];

    const upcoming = campaignStartTimestamp > now;

    // Get rewards info
    if (hasCampaignStarted || upcoming) {
      for (let i = 0n; i < rewardsCount; i++) {
        const tokenAddress = await campaignContract.read.rewardsTokens([i]);
        const rewardPerSecond = await campaignContract.read.rewardPerSecond([i]);
        const totalRewards = rewardPerSecond * deltaDuration;

        campaignRewards.push({
          tokenAddress,
          rewardPerSecond,
          totalRewards,
        });
      }
    }

    const hasCampaignEnded = campaignEndTimestamp < now;
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
    wallet: WalletClient,
  ): Promise<CampaingStatusData> {
    const campaignContract = getContract({
      abi: LiquidityMiningCampaignABI,
      address: campaignAddress as `0x${string}`,
      publicClient: this.provider,
    });

    // Get now in seconds and convert to BN
    const now = BigInt(Math.floor(Date.now() / 1000));

    // Get raw contract data
    const campaignStartTimestamp = await campaignContract.read.startTimestamp();
    const campaignEndTimestamp = await campaignContract.read.endTimestamp();
    const hasCampaignStarted = await campaignContract.read.hasStakingStarted();

    const hasCampaignEnded = hasCampaignStarted ? campaignEndTimestamp < now : false;

    const upcoming = campaignStartTimestamp > now;

    let hasUserStaked = false;

    if (active) {
      const walletAddress = await getAddressFromWallet(wallet);
      const userStakedAmount = await campaignContract.read.balanceOf([walletAddress]);
      hasUserStaked = userStakedAmount > 0n;
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
  public async getUserData(campaignAddress: string, wallet: WalletClient): Promise<UserDataLM> {
    const campaignContract = getContract({
      abi: LiquidityMiningCampaignABI,
      address: campaignAddress as `0x${string}`,
      publicClient: this.provider,
    });

    const walletAddress = await getAddressFromWallet(wallet);

    // Get raw user data
    const userStakedAmount = await campaignContract.read.balanceOf([walletAddress]);
    const rewardsCount = await campaignContract.read.getRewardTokensCount();

    const hasUserStaked = userStakedAmount > 0n;

    const userRewards = [];
    const now = BigInt(Math.floor(Date.now() / 1000));

    // Get rewards info
    if (hasUserStaked) {
      for (let i = 0n; i < rewardsCount; i++) {
        const tokenAddress = await campaignContract.read.rewardsTokens([i]);
        const currentAmount = await campaignContract.read.getUserAccumulatedReward([
          walletAddress,
          i,
          now,
        ]);

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
   * @param {WalletClient} wallet - Wallet client instance to use
   * @param {boolean} isNativeSupported - If native token is supported
   * @return {string} hash of the transaction
   */
  public async stake(
    contractAddress: string,
    amountToStake: string,
    wallet: WalletClient,
    isNativeSupported: boolean,
  ): Promise<`0x${string}`> {
    const stakingToken = await this.provider.readContract({
      abi: LiquidityMiningCampaignABI,
      address: contractAddress as `0x${string}`,
      functionName: 'stakingToken',
    });

    const address = await getAddressFromWallet(wallet);

    const tokenDecimals = await getTokenDecimals(this.provider, stakingToken);
    const amountToStakeParsed = parseUnits(amountToStake, tokenDecimals);

    if (isNativeSupported) {
      const { request } = await this.provider.simulateContract({
        abi: LiquidityMiningCampaignABI,
        address: contractAddress as `0x${string}`,
        functionName: 'stakeNative',
        account: address,
        value: amountToStakeParsed,
      });

      return await wallet.writeContract(request);
    }

    const { request } = await this.provider.simulateContract({
      abi: LiquidityMiningCampaignABI,
      address: contractAddress as `0x${string}`,
      functionName: 'stake',
      account: address,
      args: [amountToStakeParsed],
    });

    return await wallet.writeContract(request);
  }

  /**
   * Stake in tier campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {string} amountToStake - Amount to stake
   * @param {string} signature - Signature provided for the tier campaign
   * @param {number} maxTier - Max tier for the user
   * @param {number} deadline - Deadline for the signature to be over
   * @param {WalletClient} wallet - Wallet client instance to use
   * @return {string} hash of the transaction
   */
  public async stakeWithTier(
    contractAddress: string,
    amountToStake: string,
    signature: string,
    maxTier: number,
    deadline: number,
    wallet: WalletClient,
  ): Promise<`0x${string}`> {
    const stakingToken = await this.provider.readContract({
      abi: LiquidityMiningCampaignTierABI,
      address: contractAddress as `0x${string}`,
      functionName: 'stakingToken',
    });

    const address = await getAddressFromWallet(wallet);

    const tokenDecimals = await getTokenDecimals(this.provider, stakingToken);
    const amountToStakeParsed = parseUnits(amountToStake, tokenDecimals);

    const { request } = await this.provider.simulateContract({
      abi: LiquidityMiningCampaignTierABI,
      address: contractAddress as `0x${string}`,
      functionName: 'stakeWithTier',
      account: address,
      args: [amountToStakeParsed, signature as `0x${string}`, BigInt(maxTier), BigInt(deadline)],
    });

    return await wallet.writeContract(request);
  }

  /**
   * Exit from campaign (Claim & Withdraw)
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {WalletClient} wallet - Wallet client instance to use
   * @return {string} hash of the transaction
   */
  public async exit(contractAddress: string, wallet: WalletClient): Promise<`0x${string}`> {
    const address = await getAddressFromWallet(wallet);

    const { request } = await this.provider.simulateContract({
      abi: LiquidityMiningCampaignABI,
      address: contractAddress as `0x${string}`,
      functionName: 'exit',
      account: address,
    });

    return await wallet.writeContract(request);
  }

  /**
   * Claim rewards
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {WalletClient} wallet - Wallet client instance to use
   * @return {string} hash of the transaction
   */
  public async claim(contractAddress: string, wallet: WalletClient): Promise<`0x${string}`> {
    const address = await getAddressFromWallet(wallet);

    const { request } = await this.provider.simulateContract({
      abi: LiquidityMiningCampaignABI,
      address: contractAddress as `0x${string}`,
      functionName: 'claim',
      account: address,
    });

    return await wallet.writeContract(request);
  }

  /**
   * Extend campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {number} duration - Duration of the campaign in seconds
   * @param {string} rewardsPerSecond - Rewards per second in string
   * @return {string} hash of the transaction
   */
  public async extend(
    contractAddress: string,
    duration: number,
    rewardsPerSecond: string,
    wallet: WalletClient,
  ): Promise<`0x${string}`> {
    const stakingToken = await this.provider.readContract({
      abi: LiquidityMiningCampaignTierABI,
      address: contractAddress as `0x${string}`,
      functionName: 'stakingToken',
    });

    const address = await getAddressFromWallet(wallet);

    const tokenDecimals = await getTokenDecimals(this.provider, stakingToken);
    const rewardsPerSecondParsed = parseUnits(rewardsPerSecond, tokenDecimals);

    const { request } = await this.provider.simulateContract({
      abi: LiquidityMiningCampaignABI,
      address: contractAddress as `0x${string}`,
      functionName: 'extend',
      account: address,
      args: [BigInt(duration), [rewardsPerSecondParsed]],
    });

    return await wallet.writeContract(request);
  }
}

import { getContract, parseUnits, PublicClient, WalletClient } from 'viem';

import {
  CampaingData,
  CampaingStatusData,
  CampaingStatusDataActive,
  checkMaxStakingLimit,
  getAddressFromWallet,
  getTokenDecimals,
  NetworkEnum,
  UserDataStaking,
} from '..';
import { NonCompoundingRewardsPoolABI } from '../abi/NonCompoundingRewardsPool';

/**
 *  Represents a class that can interact with SoloStaker's campaigns
 *  depending on the network.
 *  @constructor
 *  @param {PublicClient} provider - Provider with the global interaction.
 *  @param {NetworkEnum} protocol - Name of the network where this class is being used.
 */
export class StakerSolo {
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
      abi: NonCompoundingRewardsPoolABI,
      address: campaignAddress as `0x${string}`,
      publicClient: this.provider,
    });

    // Get now in seconds and convert to BN
    const now = BigInt(Math.floor(Date.now() / 1000));

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
    } = campaignContract.read;

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

    const name = await namePR();
    const hasCampaignStarted = await hasStakingStartedPR();

    const promiseArray = [
      totalStakedPR(),
      startTimestampPR(),
      endTimestampPR(),
      contractStakeLimitPR(),
      stakeLimitPR(),
      getRewardTokensCountPR(),
    ];

    const [
      totalStaked,
      campaignStartTimestamp,
      campaignEndTimestamp,
      contractStakeLimit,
      walletStakeLimit,
      rewardsCount,
    ] = await Promise.all(promiseArray);

    // Get deltas in seconds
    const deltaExpiration = campaignEndTimestamp - now;
    const deltaDuration = campaignEndTimestamp - campaignStartTimestamp;

    const campaignRewards = [];

    const upcoming = campaignStartTimestamp > now;

    if (hasCampaignStarted || upcoming) {
      // Get rewards info
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
    const campaignContract = getContract({
      abi: NonCompoundingRewardsPoolABI,
      address: campaignAddress as `0x${string}`,
      publicClient: this.provider,
    });

    // Get now in seconds and convert to BN
    const now = BigInt(Math.floor(Date.now() / 1000));

    // Get raw contract data
    const campaignEndTimestamp = await campaignContract.read.endTimestamp();
    const hasCampaignStarted = await campaignContract.read.hasStakingStarted();

    const hasCampaignEnded = hasCampaignStarted ? campaignEndTimestamp < now : false;

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
  public async getCampaignStatusActive(
    campaignAddress: string,
    wallet: WalletClient,
  ): Promise<CampaingStatusDataActive> {
    const campaignContract = getContract({
      abi: NonCompoundingRewardsPoolABI,
      address: campaignAddress as `0x${string}`,
      publicClient: this.provider,
    });

    const address = await getAddressFromWallet(wallet);

    // Get now in seconds and convert to BN
    const now = BigInt(Math.floor(Date.now() / 1000));

    // Get raw contract data
    const campaignStartTimestamp = await campaignContract.read.startTimestamp();
    const campaignEndTimestamp = await campaignContract.read.endTimestamp();
    const hasCampaignStarted = await campaignContract.read.hasStakingStarted();

    const hasCampaignEnded = hasCampaignStarted ? campaignEndTimestamp < now : false;

    const upcoming = campaignStartTimestamp > now;

    const [exitTimestamp, exitStake] = await campaignContract.read.exitInfo([address]);

    return {
      hasCampaignStarted,
      hasCampaignEnded,
      exitTimestamp,
      exitStake,
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
    wallet: WalletClient,
  ): Promise<UserDataStaking> {
    const address = await getAddressFromWallet(wallet);

    // Get now in seconds and convert to BN
    const now = BigInt(Math.floor(Date.now() / 1000));

    const campaignContract = getContract({
      abi: NonCompoundingRewardsPoolABI,
      address: campaignAddress as `0x${string}`,
      publicClient: this.provider,
    });

    // Get raw user data
    const [exitTimestamp, exitStake] = await campaignContract.read.exitInfo([address]);
    const userBalance = await campaignContract.read.balanceOf([address]);

    const hasUserInitiatedWithdraw = exitTimestamp > 0n;

    const userStakedAmount = hasUserInitiatedWithdraw ? exitStake : userBalance;
    const rewardsCount = await campaignContract.read.getRewardTokensCount();

    const userRewards = [];

    if (userStakedAmount > 0n) {
      for (let i = 0n; i < rewardsCount; i++) {
        const tokenAddress = await campaignContract.read.rewardsTokens([i]);
        const currentAmount = !hasUserInitiatedWithdraw
          ? await campaignContract.read.getUserAccumulatedReward([address, i, now])
          : await campaignContract.read.getPendingReward([i]);

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
   * @param {WalletClient} wallet - Wallet client
   * @param {boolean} isNativeSupported - Switch to stake native tokens
   * @return {string} hash of the transaction
   */
  public async stake(
    contractAddress: string,
    amountToStake: string,
    wallet: WalletClient,
    isNativeSupported: boolean,
  ): Promise<`0x${string}`> {
    const stakingToken = await this.provider.readContract({
      abi: NonCompoundingRewardsPoolABI,
      address: contractAddress as `0x${string}`,
      functionName: 'stakingToken',
    });

    const tokenDecimals = await getTokenDecimals(this.provider, stakingToken);
    const amountToStakeParsed = parseUnits(amountToStake, tokenDecimals);

    if (isNativeSupported) {
      const { request } = await this.provider.simulateContract({
        abi: NonCompoundingRewardsPoolABI,
        address: contractAddress as `0x${string}`,
        functionName: 'stakeNative',
        value: amountToStakeParsed,
      });

      return await wallet.writeContract(request);
    }

    const { request } = await this.provider.simulateContract({
      abi: NonCompoundingRewardsPoolABI,
      address: contractAddress as `0x${string}`,
      functionName: 'stake',
      args: [amountToStakeParsed],
    });

    return await wallet.writeContract(request);
  }

  /**
   * Exit from campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   * @param {WalletClient} wallet - Wallet client
   * @return {string} hash of the transaction
   */
  public async exit(contractAddress: string, wallet: WalletClient): Promise<`0x${string}`> {
    const { request } = await this.provider.simulateContract({
      abi: NonCompoundingRewardsPoolABI,
      address: contractAddress as `0x${string}`,
      functionName: 'exit',
    });

    return await wallet.writeContract(request);
  }

  /**
   * Complete exit from campaign (take initial staking and rewards)
   * @public
   * @param {string} contractAddress - Address of the camapaign contract
   *  @param {WalletClient} wallet - Wallet client
   * @return {string} hash of the transaction
   */
  public async completeExit(contractAddress: string, wallet: WalletClient): Promise<`0x${string}`> {
    const { request } = await this.provider.simulateContract({
      abi: NonCompoundingRewardsPoolABI,
      address: contractAddress as `0x${string}`,
      functionName: 'completeExit',
    });

    return await wallet.writeContract(request);
  }
}

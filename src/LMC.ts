import { ethers } from 'ethers';
import { LiquidityMiningCampaign__factory } from './abi/index';

interface RewardsInfo {
  address: string;
  rewardsPerBlock: ethers.BigNumber;
}

class LMC {
  stakingRewardsContract;
  address: string;
  wallet: ethers.Wallet;
  totalStaked: ethers.BigNumber = ethers.BigNumber.from(0);
  userBallance: ethers.BigNumber = ethers.BigNumber.from(0);
  rewardsCount: number = 0;
  hasStakingStarted: boolean = false;
  hasStakingEnded: boolean = false;
  rewardsInfo: RewardsInfo[] = [];

  constructor(wallet: ethers.Wallet, address: string) {
    this.wallet = wallet;
    this.address = address;
    this.stakingRewardsContract = LiquidityMiningCampaign__factory.connect(address, wallet);
  }

  async stake(lockSchemeAddress: string, amountToStake: string) {
    const amountToStakeBN = ethers.utils.parseEther(amountToStake);
    const transaction = await this.stakingRewardsContract.stakeAndLock(amountToStakeBN, lockSchemeAddress);

    return transaction;
  }

  async claimRewards() {
    const transaction = await this.stakingRewardsContract.claim();

    return transaction;
  }

  async withdraw() {
    let transaction = await this.stakingRewardsContract.exitAndUnlock();

    return transaction;
  }

  async exitAndStake(stakerPoolAddress: string) {
    let transaction = await this.stakingRewardsContract.exitAndStake(stakerPoolAddress);

    return transaction;
  }

  async getCampaignData(provider: any) {
    const allPromise = Promise.all([
      this.stakingRewardsContract.totalStaked(),
      this.stakingRewardsContract.balanceOf(await this.wallet.getAddress()),
      this.stakingRewardsContract.getRewardTokensCount(),
      this.stakingRewardsContract.hasStakingStarted(),
      this.stakingRewardsContract.endBlock(),
    ]);

    try {
      const values = await allPromise;
      this.totalStaked = values[0];
      this.userBallance = values[1];
      this.rewardsCount = values[2].toNumber();
      this.hasStakingStarted = values[3];
      const endBlock = values[4];

      // Get current block
      const currentBlock = await provider.getBlock('latest');
      const delta = endBlock.sub(currentBlock.number);

      this.hasStakingEnded = delta.lt(0);

      // Get Reward info
      this.getRewardInfo();
    } catch (error) {
      console.log(error.message);
    }
  }

  async getTotalStaked(): Promise<ethers.BigNumber> {
    let totalStaked = ethers.BigNumber.from(0);

    try {
      totalStaked = await this.stakingRewardsContract.totalStaked();
    } catch (error) {
      console.error(error.message);
    }

    return totalStaked;
  }

  async getStakingTokensBalance(): Promise<ethers.BigNumber> {
    let userBallance = ethers.BigNumber.from(0);

    try {
      userBallance = await this.stakingRewardsContract.balanceOf(await this.wallet.getAddress());
    } catch (error) {
      console.error(error.message);
    }

    return userBallance;
  }

  async getRewardsCount(): Promise<number> {
    let rewardsCount = 0;

    try {
      rewardsCount = await (await this.stakingRewardsContract.getRewardTokensCount()).toNumber();
    } catch (error) {
      console.error(error.message);
    }

    return rewardsCount;
  }

  async hasCampaingStarted(): Promise<boolean> {
    let hasStakingStarted = false;

    try {
      hasStakingStarted = await this.stakingRewardsContract.hasStakingStarted();
    } catch (error) {
      console.error(error.message);
    }

    return hasStakingStarted;
  }

  async hasCampaignEnded(currentBlockNumber: number): Promise<boolean> {
    let endBlock = ethers.BigNumber.from(0);

    try {
      endBlock = await this.stakingRewardsContract.endBlock();
    } catch (error) {
      console.error(error.message);
    }

    const delta = endBlock.sub(currentBlockNumber);

    return delta.lt(0);
  }

  calculateStakingPoolPercentage(): number {
    let poolSharePercentage = ethers.BigNumber.from(0);

    if (this.totalStaked.gt(0) && this.userBallance.gt(0)) {
      const poolShare = this.totalStaked.div(this.userBallance);
      poolSharePercentage = poolShare.mul(100);
    }

    return poolSharePercentage.toNumber();
  }

  async getRewardInfo() {
    const { rewardsTokens, rewardPerBlock } = this.stakingRewardsContract;

    if (this.rewardsCount > 0) {
      for (let i = 0; i < this.rewardsCount; i++) {
        this.rewardsInfo = [
          ...this.rewardsInfo,
          {
            address: await rewardsTokens(i),
            rewardsPerBlock: await rewardPerBlock(i),
          },
        ];
      }
    }
  }
}

export default LMC;

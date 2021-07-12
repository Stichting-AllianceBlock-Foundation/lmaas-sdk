import { ethers } from 'ethers';
import { LiquidityMiningCampaign__factory } from './abi/index';

interface RewardsInfo {
  address: string;
  rewardsPerBlock: ethers.BigNumber;
}

class LMC {
  liquidityMiningCampaign;
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
    this.liquidityMiningCampaign = LiquidityMiningCampaign__factory.connect(address, wallet);
  }

  async stake(lockSchemeAddress: string, amountToStake: string) {
    const amountToStakeBN = ethers.utils.parseEther(amountToStake);
    const transaction = await this.liquidityMiningCampaign.stakeAndLock(amountToStakeBN, lockSchemeAddress);

    return transaction;
  }

  async claimRewards() {
    const transaction = await this.liquidityMiningCampaign.claim();

    return transaction;
  }

  async withdraw() {
    let transaction = await this.liquidityMiningCampaign.exitAndUnlock();

    return transaction;
  }

  async exitAndStake(stakingPoolCampaignAddress: string) {
    let transaction = await this.liquidityMiningCampaign.exitAndStake(stakingPoolCampaignAddress);

    return transaction;
  }

  async getCampaignData(provider: any) {
    const allPromise = Promise.all([
      this.liquidityMiningCampaign.totalStaked(),
      this.liquidityMiningCampaign.balanceOf(await this.wallet.getAddress()),
      this.liquidityMiningCampaign.getRewardTokensCount(),
      this.liquidityMiningCampaign.hasStakingStarted(),
      this.liquidityMiningCampaign.endBlock(),
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
      totalStaked = await this.liquidityMiningCampaign.totalStaked();
    } catch (error) {
      console.error(error.message);
    }

    return totalStaked;
  }

  async getStakingTokensBalance(): Promise<ethers.BigNumber> {
    let userBallance = ethers.BigNumber.from(0);

    try {
      userBallance = await this.liquidityMiningCampaign.balanceOf(await this.wallet.getAddress());
    } catch (error) {
      console.error(error.message);
    }

    return userBallance;
  }

  async getRewardsCount(): Promise<number> {
    let rewardsCount = 0;

    try {
      rewardsCount = await (await this.liquidityMiningCampaign.getRewardTokensCount()).toNumber();
    } catch (error) {
      console.error(error.message);
    }

    return rewardsCount;
  }

  async hasCampaingStarted(): Promise<boolean> {
    let hasStakingStarted = false;

    try {
      hasStakingStarted = await this.liquidityMiningCampaign.hasStakingStarted();
    } catch (error) {
      console.error(error.message);
    }

    return hasStakingStarted;
  }

  async hasCampaignEnded(currentBlockNumber: number): Promise<boolean> {
    let endBlock = ethers.BigNumber.from(0);

    try {
      endBlock = await this.liquidityMiningCampaign.endBlock();
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
    const { rewardsTokens, rewardPerBlock } = this.liquidityMiningCampaign;

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

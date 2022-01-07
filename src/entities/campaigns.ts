import { BigNumberish } from 'ethers';

export interface CampaingData {
  totalStaked: BigNumberish;
  campaignStartBlock: BigNumberish;
  campaignEndBlock: BigNumberish;
  contractStakeLimit: BigNumberish;
  walletStakeLimit: BigNumberish;
  deltaExpirationBlocks: BigNumberish;
  deltaDurationBlocks: BigNumberish;
  hasContractStakeLimit: boolean;
  hasWalletStakeLimit: boolean;
  hasCampaignStarted: boolean;
  hasCampaignEnded: boolean;
  campaignRewards: CampaignRewards[];
}
export interface UserData {
  userStakedAmount: BigNumberish;
  hasUserStaked: boolean;
  userRewards: UserRewards[];
}

export interface CampaignRewards {
  tokenAddress: string;
  rewardPerBlock: BigNumberish;
  totalRewards: BigNumberish;
}

export interface UserRewards {
  tokenAddress: string;
  currentAmount: BigNumberish;
}

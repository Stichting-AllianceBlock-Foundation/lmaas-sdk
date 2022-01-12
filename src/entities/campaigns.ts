import { BigNumberish } from 'ethers';

export interface CampaingData {
  totalStaked: BigNumberish;
  campaignStartTimestamp: BigNumberish;
  campaignEndTimestamp: BigNumberish;
  contractStakeLimit: BigNumberish;
  walletStakeLimit: BigNumberish;
  deltaExpiration: BigNumberish;
  deltaDuration: BigNumberish;
  hasContractStakeLimit: boolean;
  hasWalletStakeLimit: boolean;
  hasCampaignStarted: boolean;
  hasCampaignEnded: boolean;
  campaignRewards: CampaignRewards[];
}

export interface CampaingStatusData {
  hasCampaignStarted: boolean;
  hasCampaignEnded: boolean;
}
export interface UserData {
  userStakedAmount: BigNumberish;
  hasUserStaked: boolean;
  userRewards: UserRewards[];
}

export interface CampaignRewards {
  tokenAddress: string;
  rewardPerSecond: BigNumberish;
  totalRewards: BigNumberish;
}

export interface UserRewards {
  tokenAddress: string;
  currentAmount: BigNumberish;
}

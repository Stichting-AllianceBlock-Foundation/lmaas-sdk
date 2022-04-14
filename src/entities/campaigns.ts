import { BigNumberish } from 'ethers';

export interface CampaingData {
  totalStaked: BigNumberish;
  campaignStartTimestamp: BigNumberish;
  campaignEndTimestamp: BigNumberish;
  contractStakeLimit: BigNumberish;
  walletStakeLimit: BigNumberish;
  deltaExpiration: BigNumberish;
  deltaDuration: BigNumberish;
  extensionDuration?: BigNumberish;
  hasContractStakeLimit: boolean;
  hasWalletStakeLimit: boolean;
  hasCampaignStarted: boolean;
  hasCampaignEnded: boolean;
  campaignRewards: CampaignRewards[];
  rewardsCount: number;
  name: string;
}

export interface CampaingStatusData {
  hasCampaignStarted: boolean;
  hasCampaignEnded: boolean;
  hasUserStaked?: boolean;
}

export interface CampaingStatusDataActive {
  hasCampaignStarted: boolean;
  hasCampaignEnded: boolean;
  exitTimestamp: BigNumberish;
  exitStake: BigNumberish;
}

export interface UserDataLM {
  userStakedAmount: BigNumberish;
  hasUserStaked: boolean;
  userRewards: UserRewards[];
}

export interface UserDataStaking {
  exitTimestamp: BigNumberish;
  exitStake: BigNumberish;
  userStakedAmount: BigNumberish;
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

import { BigNumber } from '@ethersproject/bignumber';

import { DexEnum, NetworkEnum } from '..';

export interface LMInterface {
  network: NetworkEnum;
  campaignAddress: string;
  dex: DexEnum;
  liquidityPoolAddress: string;
  provisionTokensAddresses: string[];
  rewardsAddresses: string[];
  lockSchemeAddress?: string;
  version: string;
  routerAddress?: string;
  campaignMessage?: string;
  campaignStart?: number;
  campaignEnd?: number;
  name?: string;
}

export interface StakingInterface {
  network: NetworkEnum;
  campaignAddress: string;
  campaignTokenAddress: string;
  rewardsAddresses: string[];
  compounding: boolean;
  period: string;
  version: string;
  campaignMessage?: string;
  campaignStart?: number;
  campaignEnd?: number;
  name?: string;
  isLpToken: boolean;
}
export interface CampaingData {
  totalStaked: BigNumber;
  campaignStartTimestamp: BigNumber;
  campaignEndTimestamp: BigNumber;
  contractStakeLimit: BigNumber;
  walletStakeLimit: BigNumber;
  deltaExpiration: BigNumber;
  deltaDuration: BigNumber;
  extensionDuration?: BigNumber;
  hasContractStakeLimit: boolean;
  hasWalletStakeLimit: boolean;
  hasCampaignStarted: boolean;
  hasCampaignEnded: boolean;
  campaignRewards: CampaignRewardsNew[];
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
  exitTimestamp: BigNumber;
  exitStake: BigNumber;
}

export interface UserDataLM {
  userStakedAmount: BigNumber;
  hasUserStaked: boolean;
  userRewards: UserRewards[];
}

export interface UserDataStaking {
  exitTimestamp: BigNumber;
  exitStake: BigNumber;
  userStakedAmount: BigNumber;
  userRewards: UserRewards[];
}

export interface CampaignRewardsNew {
  tokenAddress: string;
  rewardPerSecond: BigNumber;
  totalRewards: BigNumber;
}

export interface CampaignRewards {
  total: Reward[];
  weekly: Reward[];
}

export interface CampaignRewards {
  [key: string]: {
    tokenName: string;
    tokenAddress: string;
    tokenAmount: string;
  }[];
}

export interface UserRewards {
  tokenAddress: string;
  currentAmount: BigNumber;
}

export interface Reward {
  tokenAmount: string;
  tokenName: string;
  tokenAddress: string;
}

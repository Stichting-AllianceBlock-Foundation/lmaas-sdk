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
  wrappedNativeToken: string;
  isNativeSupported: boolean;
}

export interface InfiniteStakingInterface {
  network: NetworkEnum;
  campaignAddress: string;
  campaignTokenAddress: string;
  rewardsAddresses: string[];
  compounding: boolean;
  version: string;
  campaignMessage?: string;
  name?: string;
  isLpToken: boolean;
}

export interface InfiniteCampaignData extends CampaingData {
  rewardsDistributing: boolean;
}
export interface CampaingData {
  totalStaked: bigint;
  campaignStartTimestamp: bigint;
  campaignEndTimestamp: bigint;
  contractStakeLimit: bigint;
  walletStakeLimit: bigint;
  deltaExpiration: bigint;
  deltaDuration: bigint;
  extensionDuration?: bigint;
  hasContractStakeLimit: boolean;
  hasWalletStakeLimit: boolean;
  hasCampaignStarted: boolean;
  hasCampaignEnded: boolean;
  campaignRewards: CampaignRewardsNew[];
  rewardsCount: bigint;
  name: string;
  wrappedNativeToken: string;
}

export interface InfiniteCampaingStatusData extends CampaingStatusData {
  rewardsDistributing: boolean;
}

export interface CampaingStatusData {
  hasCampaignStarted: boolean;
  hasCampaignEnded: boolean;
  hasUserStaked?: boolean;
  upcoming?: boolean;
}

export interface CampaingStatusDataActive {
  hasCampaignStarted: boolean;
  hasCampaignEnded: boolean;
  exitTimestamp: bigint;
  exitStake: bigint;
  upcoming?: boolean;
}

export interface UserDataLM {
  userStakedAmount: bigint;
  hasUserStaked: boolean;
  userRewards: UserRewards[];
}

export interface UserDataStaking {
  exitTimestamp: bigint;
  exitStake: bigint;
  userStakedAmount: bigint;
  userRewards: UserRewards[];
}

export interface CampaignRewardsNew {
  tokenAddress: string;
  rewardPerSecond: bigint;
  totalRewards: bigint;
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
  currentAmount: bigint;
}

export interface Reward {
  tokenAmount: string;
  tokenName: string;
  tokenAddress: string;
}

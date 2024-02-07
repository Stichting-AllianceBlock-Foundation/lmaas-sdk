import { DexEnum, NetworkEnum } from '..';

export type PoolVersion = '1.0' | '2.0' | '3.0' | '4.0';

export interface LMInterface {
  network: NetworkEnum;
  campaignAddress: string;
  dex: DexEnum;
  liquidityPoolAddress: string;
  provisionTokensAddresses: string[];
  rewardsAddresses: string[];
  lockSchemeAddress?: string;
  version: PoolVersion;
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
  version: PoolVersion;
  campaignMessage?: string;
  campaignStart?: number;
  campaignEnd?: number;
  name?: string;
  isLpToken: boolean;
  isNativeSupported: boolean;
}

export interface InfiniteStakingInterface {
  network: NetworkEnum;
  campaignAddress: string;
  campaignTokenAddress: string;
  rewardsAddresses: string[];
  compounding: boolean;
  version: PoolVersion;
  campaignMessage?: string;
  campaignStart?: number;
  campaignEnd?: number;
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
}

export interface InfiniteCampaingStatusData {
  hasCampaignStarted: boolean;
  currentEpochAssigned: boolean;
  rewardsDistributing: boolean;
  hasUserStaked?: boolean;
  unlockedRewards: boolean;
  upcoming: boolean;
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

export interface UserDataIStaking {
  userCanExit: boolean;
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

export enum InfiniteStakingState {
  NOT_STARTED,
  STARTED_WITH_UNLOCKED_REWARDS,
  STARTED_WITH_REWARDS,
  STARTED_WITHOUT_REWARDS,
  STAKED_WITH_REWARDS,
  STAKED_WITH_UNLOCKED_REWARDS,
  STAKED_WITHOUT_REWARDS,
  UNSCHEDULED,
}

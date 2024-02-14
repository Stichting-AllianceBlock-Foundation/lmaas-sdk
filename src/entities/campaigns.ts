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

export interface InfiniteCampaingStatusData extends InfiniteCampaignBaseStatusData {
  state: InfiniteStakingState;
  staked: boolean;
}

export interface InfiniteCampaignStatusStateData extends InfiniteCampaignBaseStatusData {
  state: InfiniteStakingState;
}

export interface InfiniteCampaignBaseStatusData {
  startTimestamp: number;
  endTimestamp: number;
  epochDuration: number;
  distributableFunds: boolean;
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
  SCHEDULED,
  ACTIVE,
  EXPIRED,
}

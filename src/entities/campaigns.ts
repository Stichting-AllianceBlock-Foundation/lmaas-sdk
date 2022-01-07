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
  campaingnRewards: CampaignRewards[];
}

export interface CampaignRewards {
  tokenAddress: string;
  rewardPerBlock: BigNumberish;
  totalRewards: BigNumberish;
}

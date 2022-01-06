import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';

import { CampaingData, NetworkEnum } from '..';
import LiquidityMiningCampaignABI from '../abi/LiquidityMiningCampaign.json';

export class SDKLm {
  // Get network by provider (build patterns, async) !!
  protected protocol: NetworkEnum;
  protected provider: Web3Provider;

  constructor(provider: Web3Provider, protocol: NetworkEnum) {
    this.provider = provider;
    this.protocol = protocol;
  }

  public async getCampaignData(campaignAddress: string): Promise<CampaingData> {
    const stakingRewardsContract = new Contract(
      campaignAddress,
      LiquidityMiningCampaignABI,
      this.provider
    );

    const totalStaked = await stakingRewardsContract.totalStaked();

    return {
      totalStaked,
    };
  }

  /**
   * Withdraw from campaign
   * @public
   * @param {string} contractAddress - Address of the camapaign contracts
   * @return {object} transaction object
   */
  public async withdraw(contractAddress: string) {
    const signer = this.provider.getSigner();
    const stakingRewardsContract = new Contract(
      contractAddress,
      LiquidityMiningCampaignABI,
      signer
    );

    let transaction = await stakingRewardsContract.exitAndUnlock();

    return transaction;
  }
}

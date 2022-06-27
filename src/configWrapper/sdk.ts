import axios from 'axios';

import { Config, LMInterface, StakingInterface, Token } from '..';

export class ConfigWrapper {
  config: Config | null;
  baseUrl: string;
  tenantName: string;

  constructor(baseUrl: string, tenantName: string) {
    this.baseUrl = baseUrl;
    this.tenantName = tenantName;
    this.config = null;
  }

  async loadConfig(): Promise<void> {
    const response = await axios.get(this.baseUrl + '/config?tenant=' + this.tenantName);

    // Convert all addresses in lowerCase
    const { campaignsLM, campaignsStaking, tokens } = response.data.config.config;

    const campaignsLMLower = campaignsLM.map((campaign: LMInterface) => {
      const provisionTokensAddressesLower = campaign.provisionTokensAddresses.map(address =>
        address.toLowerCase(),
      );
      const rewardsAddressesLower = campaign.rewardsAddresses.map(address => address.toLowerCase());

      const campaignLower = {
        ...campaign,
        rewardsAddresses: rewardsAddressesLower,
        provisionTokensAddresses: provisionTokensAddressesLower,
        version: !campaign.version ? '1.0' : campaign.version,
        campaignMessage: campaign.campaignMessage || '',
      };

      return campaignLower;
    });

    const campaignsStakingLower = campaignsStaking.map((campaign: StakingInterface) => {
      const rewardsAddressesLower = campaign.rewardsAddresses.map(address => address.toLowerCase());
      const campaignLower = {
        ...campaign,
        rewardsAddresses: rewardsAddressesLower,
        campaignTokenAddress: campaign.campaignTokenAddress.toLowerCase(),
        version: !campaign.version ? '1.0' : campaign.version,
        campaignMessage: campaign.campaignMessage || '',
      };

      return campaignLower;
    });

    const tokensLower = tokens.map((token: Token) => {
      const tokensLower = { ...token, address: token.address.toLowerCase() };

      return tokensLower;
    });

    response.data.config.config = {
      ...response.data.config.config,
      campaignsLM: campaignsLMLower,
      campaignsStaking: campaignsStakingLower,
      tokens: tokensLower,
    };

    this.config = response.data.config;
  }

  getLmCampaigns(network: string, filter?: () => boolean) {
    if (this.config === null)
      throw new Error('ConfigWrapper: Config not set, please loadConfig method first.');

    if (filter) {
      return this.config?.config.campaignsLM.filter(item => item.network === network && filter());
    }

    return this.config?.config.campaignsLM.filter(item => item.network === network);
  }

  getStakingCampaigns(network: string, filter?: () => boolean) {
    if (this.config === null)
      throw new Error('ConfigWrapper: Config not set, please loadConfig method first.');

    if (filter) {
      return this.config?.config.campaignsStaking.filter(
        item => item.network === network && filter(),
      );
    }

    return this.config?.config.campaignsStaking.filter(item => item.network === network);
  }

  getSocialMedia() {
    return this.config?.socialMedia;
  }

  getLogoUrl() {
    return this.config?.logoUrl;
  }
}

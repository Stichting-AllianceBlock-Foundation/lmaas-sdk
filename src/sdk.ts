import { JsonRpcBatchProvider, Web3Provider } from '@ethersproject/providers';

import {
  CampaignWrapper,
  CoinGecko,
  DexWrapper,
  NetworkEnum,
  SoloStakerWrapper,
  StakerLM,
  StakerSolo,
  TokenConfigs,
} from '..';

export class StakerSDK {
  lmcStaker: StakerLM;
  soloNonCompStaker: StakerSolo;
  coingecko: CoinGecko;
  soloStakerWrapper: SoloStakerWrapper;
  provider: JsonRpcBatchProvider | Web3Provider;
  dexWrapper: DexWrapper;
  campaignWrapper: CampaignWrapper;

  constructor(
    provider: JsonRpcBatchProvider | Web3Provider,
    protocol: NetworkEnum,
    tokenConfigs: TokenConfigs,
  ) {
    this.provider = provider;
    this.lmcStaker = new StakerLM(this.provider as Web3Provider, protocol);
    this.soloNonCompStaker = new StakerSolo(this.provider as Web3Provider, protocol);
    this.coingecko = new CoinGecko();
    this.soloStakerWrapper = new SoloStakerWrapper(
      this.provider as Web3Provider,
      this.soloNonCompStaker,
      this.coingecko,
      protocol,
      tokenConfigs,
    );
    this.dexWrapper = new DexWrapper(this.provider as Web3Provider, protocol, tokenConfigs);
    this.campaignWrapper = new CampaignWrapper(
      this.provider as Web3Provider,
      this.lmcStaker,
      this.coingecko,
      tokenConfigs,
      protocol,
    );
  }
}

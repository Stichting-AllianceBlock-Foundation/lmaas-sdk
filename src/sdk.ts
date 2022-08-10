import { JsonRpcBatchProvider, Web3Provider } from '@ethersproject/providers';

import {
  BlockchainConfig,
  CampaignWrapper,
  CoinGecko,
  DexWrapper,
  getTokensConfig,
  NetworkEnum,
  SoloStakerWrapper,
  StakerLM,
  StakerSolo,
} from '.';

/**
 *  Represents a class that can interact with the ecosystem of LiquidityMining
 *  depending on the network.
 *  @constructor
 *  @param {StakerLM} lmcStaker - Class that helps with the actions of a LMC.
 *  @param {StakerSolo} soloNonCompStaker - Class that help with the actions of SoloStaker campaigns.
 *  @param {CoinGecko} coingecko - Class for fetching the balance of the CoinGecko API.
 *  @param {SoloStakerWrapper} soloStakerWrapper - Class that help with the actions of SoloStaker campaigns.
 *  @param {CampaignWrapper} campaignWrapper - Class that help with the actions of LMC's.
 *  @param {DexWrapper} dexWrapper - Class that help with the actions of DEX's depending on the network.
 *  @param {number} chainId - Name of the network where this class is being used.
 *  @param {JsonRpcBatchProvider | Web3Provider} provider - Provider that helps every class to interact with the blockchain.
 */
export class StakerSDK {
  lmcStaker: StakerLM;
  soloNonCompStaker: StakerSolo;
  coingecko: CoinGecko;
  soloStakerWrapper: SoloStakerWrapper;
  provider: JsonRpcBatchProvider | Web3Provider;
  dexWrapper: DexWrapper;
  campaignWrapper: CampaignWrapper;
  protocol: NetworkEnum;

  constructor(
    provider: JsonRpcBatchProvider | Web3Provider,
    chainId: number,
    config: BlockchainConfig,
  ) {
    this.provider = provider; // @notice General provider for the global interaction of the blockchain.
    this.coingecko = new CoinGecko(); // @notice Coingecko fetcher class for their API
    this.protocol = this.getProtocolByChainId(chainId);

    this.lmcStaker = new StakerLM(this.provider as Web3Provider, this.protocol);
    this.soloNonCompStaker = new StakerSolo(this.provider as Web3Provider, this.protocol);

    this.soloStakerWrapper = new SoloStakerWrapper(
      this.provider as Web3Provider,
      this.soloNonCompStaker,
      this.coingecko,
      this.protocol,
      getTokensConfig(config.tokens.filter(item => item.network === this.protocol)),
    );
    this.campaignWrapper = new CampaignWrapper(
      this.provider as Web3Provider,
      this.lmcStaker,
      this.coingecko,
      getTokensConfig(config.tokens.filter(item => item.network === this.protocol)),
      this.protocol,
    );
    this.dexWrapper = new DexWrapper(
      this.provider as Web3Provider,
      this.protocol,
      getTokensConfig(config.tokens.filter(item => item.network === this.protocol)),
    );
  }

  /**
   *  Extract the chainId into a enum easy to select and have control.
   *  @param {number} chainId - chainId where we can return the current network.
   */
  getProtocolByChainId(chainId: number) {
    switch (chainId) {
      case 1:
      case 42:
      case 3:
      case 4:
      case 5:
        return NetworkEnum.eth;
      case 56:
        return NetworkEnum.bsc;
      case 137:
      case 80001:
        return NetworkEnum.polygon;
      case 43113:
      case 43114:
        return NetworkEnum.avalanche;
      case 246:
        return NetworkEnum.ewc;
      case 1284:
        return NetworkEnum.moonbeam;
      default:
        return NetworkEnum.localhost;
    }
  }
}

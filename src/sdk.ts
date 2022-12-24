import { JsonRpcBatchProvider, JsonRpcProvider } from '@ethersproject/providers';

import {
  ALBStaker,
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
 *  @param {JsonRpcBatchProvider | JsonRpcProvider} provider - Provider that helps every class to interact with the blockchain.
 */
export class StakerSDK {
  lmcStaker: StakerLM;
  albStaker: ALBStaker;
  soloNonCompStaker: StakerSolo;
  coingecko: CoinGecko;
  soloStakerWrapper: SoloStakerWrapper;
  provider: JsonRpcBatchProvider | JsonRpcProvider;
  dexWrapper: DexWrapper;
  campaignWrapper: CampaignWrapper;
  protocol: NetworkEnum;

  constructor(
    provider: JsonRpcBatchProvider | JsonRpcProvider,
    chainId: number,
    config: BlockchainConfig,
    minutesForExpiration: number,
  ) {
    this.provider = provider; // @notice General provider for the global interaction of the blockchain.
    this.coingecko = new CoinGecko(minutesForExpiration); // @notice Coingecko fetcher class for their API
    this.protocol = getProtocolByChainId(chainId);

    this.lmcStaker = new StakerLM(this.provider, this.protocol);
    this.albStaker = new ALBStaker(this.provider, this.protocol);
    this.soloNonCompStaker = new StakerSolo(this.provider, this.protocol);

    this.soloStakerWrapper = new SoloStakerWrapper(
      this.provider,
      this.soloNonCompStaker,
      this.coingecko,
      this.protocol,
      getTokensConfig(config.tokens.filter(item => item.network === this.protocol)),
    );
    this.campaignWrapper = new CampaignWrapper(
      this.provider as JsonRpcBatchProvider,
      this.lmcStaker,
      this.albStaker,
      this.coingecko,
      getTokensConfig(config.tokens.filter(item => item.network === this.protocol)),
      this.protocol,
    );
    this.dexWrapper = new DexWrapper(
      this.provider,
      this.protocol,
      getTokensConfig(config.tokens.filter(item => item.network === this.protocol)),
    );
  }
}

/**
 *  Extract the chainId into a enum easy to select and have control.
 *  @param {number} chainId - chainId where we can return the current network.
 */
export function getProtocolByChainId(chainId: number) {
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
    case 19:
      return NetworkEnum.songbird;
    default:
      return NetworkEnum.localhost;
  }
}

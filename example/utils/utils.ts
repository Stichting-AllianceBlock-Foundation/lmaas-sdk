import { InjectedConnector } from '@web3-react/injected-connector';
import { NetworkEnum } from '@stichting-allianceblock-foundation/lmaas-sdk';

export const injected = new InjectedConnector({ supportedChainIds: [1, 3, 4, 5, 42, 56, 246] });

export const getProtocolByChainId = (chainId: number) => {
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
};

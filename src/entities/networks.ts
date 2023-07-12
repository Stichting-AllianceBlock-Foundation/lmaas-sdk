import { Abi } from 'viem';

export enum NetworkEnum {
  eth = 'eth',
  bsc = 'bsc',
  avalanche = 'avalanche',
  polygon = 'polygon',
  ewc = 'ewc',
  moonbeam = 'moonbeam',
  songbird = 'songbird',
}

export enum DexEnum {
  uniswap = 'uniswap',
  balancer = 'balancer',
  pancakeswap = 'pancakeswap',
  pangolin = 'pangolin',
  quickswap = 'quickswap',
  solarflare = 'solarflare',
  arrakis = 'arrakis',
}

export type DexByNetworkMapping = {
  [key in NetworkEnum]: {
    nativeToken: string;
    dexes: {
      [key: string]: {
        routerABI: Abi;
        poolABI: Abi;
        routerAddress: `0x${string}`;
        interactWithNativeSuffix: string;
      };
    };
  };
};

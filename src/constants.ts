import { Abi, parseEther } from 'viem';

import { AbPoolABI } from './abi/AllianceBlockDexPoolABI';
import { AbRouterABI } from './abi/AllianceBlockDexRouterABI';
import { ArrakisPoolABI } from './abi/ArrakisPoolABI';
import { ArrakisRouterABI } from './abi/ArrakisRouterABI';
import { BalancerPoolABI } from './abi/BalancerBPoolABI';
import { PangolinRouterABI } from './abi/PangolinRouterABI';
import { SolarflareRouterABI } from './abi/SolarflareRouterABI';
import { UniswapRouterABI } from './abi/UniswapRouterABI';
import { UniswapPoolABI } from './abi/UniswapV2PairABI';
import { NetworkEnum } from './entities';

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

export const accuracy = parseEther('1');
export const STAKING_CAMPAIGN_STATE = {
  NOT_STARTED: -1,
  STAKING_IN_PROGRESS: 0,
  NOT_WITHDRAW: 1,
  WITHDRAW: 2,
  NOT_CLAIMED: 3,
  CLAIMED: 4,
};

export const dexes = [
  'uniswap',
  'pancakeswap',
  'quickswap',
  'pangolin',
  'alliancedex',
  'solarflare',
  'arrakis',
];

export const dexByNetworkMapping: DexByNetworkMapping = {
  eth: {
    nativeToken: 'ETH',
    dexes: {
      uniswap: {
        routerABI: UniswapRouterABI,
        poolABI: UniswapPoolABI,
        routerAddress: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
        interactWithNativeSuffix: 'ETH',
      },
      balancer: {
        poolABI: BalancerPoolABI,
        routerABI: {} as Abi,
        routerAddress: '0x0',
        interactWithNativeSuffix: 'ETH',
      },
    },
  },
  bsc: {
    nativeToken: 'BNB',
    dexes: {
      pancakeswap: {
        routerABI: UniswapRouterABI,
        poolABI: UniswapPoolABI,
        routerAddress: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
        interactWithNativeSuffix: 'ETH',
      },
    },
  },
  avalanche: {
    nativeToken: 'AVAX',
    dexes: {
      pangolin: {
        routerABI: PangolinRouterABI,
        poolABI: UniswapPoolABI,
        routerAddress: '0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106',
        interactWithNativeSuffix: 'AVAX',
      },
    },
  },
  ewc: {
    nativeToken: 'EWC',
    dexes: {
      alliancedex: {
        routerABI: AbRouterABI,
        poolABI: AbPoolABI,
        routerAddress: '0x6751c00E8A0E25c39175168DE4D34C8c9713cA30',
        interactWithNativeSuffix: 'Native',
      },
    },
  },
  moonbeam: {
    nativeToken: 'GLMR',
    dexes: {
      solarflare: {
        routerABI: SolarflareRouterABI,
        poolABI: UniswapPoolABI,
        routerAddress: '0xd3B02Ff30c218c7f7756BA14bcA075Bf7C2C951e',
        interactWithNativeSuffix: 'ETH',
      },
    },
  },
  polygon: {
    nativeToken: 'MATIC',
    dexes: {
      quickswap: {
        routerABI: UniswapRouterABI,
        poolABI: UniswapPoolABI,
        routerAddress: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
        interactWithNativeSuffix: 'ETH',
      },
      arrakis: {
        routerABI: ArrakisRouterABI,
        poolABI: ArrakisPoolABI,
        routerAddress: '0xc73fb100a995b33f9fA181d420f4C8D74506dF66',
        interactWithNativeSuffix: 'ETH',
      },
    },
  },
  songbird: {
    nativeToken: 'SGB',
    dexes: {
      pangolin: {
        routerABI: PangolinRouterABI,
        poolABI: UniswapPoolABI,
        routerAddress: '0x6591cf4E1CfDDEcB4Aa5946c033596635Ba6FB0F', // Router address is different for test and main nets, so needs to be dynamic
        interactWithNativeSuffix: 'AVAX',
      },
    },
  },
};

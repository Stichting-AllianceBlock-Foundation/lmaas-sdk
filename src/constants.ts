import { DexByNetworkMapping } from '.';
import AllianceBlockDexPoolABI from './abi/AllianceBlockDexPoolABI.json';
import AllianceBlockDexRouterABI from './abi/AllianceBlockDexRouterABI.json';
import balancerPoolABI from './abi/BalancerBPoolABI.json';
import pangolinRouterABI from './abi/PangolinRouterABI.json';
import SolarflareRouterABI from './abi/SolarflareRouterABI.json';
import uniswapRouterABI from './abi/UniswapRouterABI.json';
import uniswapPoolABI from './abi/UniswapV2PairABI.json';

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
];

export const dexByNetworkMapping: DexByNetworkMapping = {
  eth: {
    nativeToken: 'ETH',
    dexes: {
      uniswap: {
        routerABI: uniswapRouterABI,
        poolABI: uniswapPoolABI,
        routerAddress: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
        interactWithNativeSuffix: 'ETH',
      },
      balancer: {
        poolABI: balancerPoolABI,
      },
    },
  },
  bsc: {
    nativeToken: 'BNB',
    dexes: {
      pancakeswap: {
        routerABI: uniswapRouterABI,
        poolABI: uniswapPoolABI,
        routerAddress: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
        interactWithNativeSuffix: 'ETH',
      },
    },
  },
  avalanche: {
    nativeToken: 'AVAX',
    dexes: {
      pangolin: {
        routerABI: pangolinRouterABI,
        poolABI: uniswapPoolABI,
        routerAddress: process.env.REACT_APP_PANGOLIN_ROUTER, // Router address is different for test and main nets, so needs to be dynamic
        interactWithNativeSuffix: 'AVAX',
      },
    },
  },
  ewc: {
    nativeToken: 'EWC',
    dexes: {
      alliancedex: {
        routerABI: AllianceBlockDexRouterABI,
        poolABI: AllianceBlockDexPoolABI,
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
        poolABI: uniswapPoolABI,
        routerAddress: '0xd3B02Ff30c218c7f7756BA14bcA075Bf7C2C951e',
        interactWithNativeSuffix: 'ETH',
      },
    },
  },
  polygon: {
    nativeToken: 'MATIC',
    dexes: {
      quickswap: {
        routerABI: uniswapRouterABI,
        poolABI: uniswapPoolABI,
        routerAddress: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
        interactWithNativeSuffix: 'ETH',
      },
    },
  },
};

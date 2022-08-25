export enum NetworkEnum {
  eth = 'eth',
  bsc = 'bsc',
  avalanche = 'avalanche',
  polygon = 'polygon',
  ewc = 'ewc',
  moonbeam = 'moonbeam',
  localhost = 'localhost',
}

export enum DexEnum {
  uniswap = 'uniswap',
  balancer = 'balancer',
  pancakeswap = 'pancakeswap',
  pangolin = 'pangolin',
  quickswap = 'quickswap',
  alliancedex = 'alliancedex',
}
export interface DexByNetworkMapping {
  [key: string]: any;
}

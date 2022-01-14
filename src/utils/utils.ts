import { BigNumber, constants } from 'ethers';
import { formatUnits } from 'ethers/lib/utils';

// CONSTANTS
const BLOCKS_PER_DAY_ETH = 6646;
const BLOCKS_PER_DAY_BSC = 28800;
const BLOCKS_PER_DAY_POLY = 43200;
const BLOCKS_PER_DAY_AVAX = 43200;

export const BLOCKS_COUNT = {
  eth: {
    PER_DAY: BLOCKS_PER_DAY_ETH,
    PER_WEEK: BLOCKS_PER_DAY_ETH * 7,
    PER_30_DAYS: BLOCKS_PER_DAY_ETH * 30,
  },
  bsc: {
    PER_DAY: BLOCKS_PER_DAY_BSC,
    PER_WEEK: BLOCKS_PER_DAY_BSC * 7,
    PER_30_DAYS: BLOCKS_PER_DAY_BSC * 30,
  },
  polygon: {
    PER_DAY: BLOCKS_PER_DAY_POLY,
    PER_WEEK: BLOCKS_PER_DAY_POLY * 7,
    PER_30_DAYS: BLOCKS_PER_DAY_POLY * 30,
  },
  avalanche: {
    PER_DAY: BLOCKS_PER_DAY_AVAX,
    PER_WEEK: BLOCKS_PER_DAY_AVAX * 7,
    PER_30_DAYS: BLOCKS_PER_DAY_AVAX * 30,
  },
};

export const checkMaxStakingLimit = (limit: BigNumber): boolean => {
  const tenBN = BigNumber.from(10);
  const tenPow18BN = tenBN.pow(18);
  const maxAmount = constants.MaxUint256.div(tenPow18BN);

  return limit.div(tenPow18BN).eq(maxAmount);
};

export const formatValuesToString = (values: BigNumber[], decimals: number = 18): string[] => {
  return values.map(v => formatUnits(v.toString(), decimals));
};

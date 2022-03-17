import { FunctionFragment } from '@ethersproject/abi';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { formatUnits, parseEther } from '@ethersproject/units';
import { BigNumber, constants } from 'ethers';

import ERC20ABI from '../abi/ERC20.json';

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

export const formatValuesToString = (values: BigNumber[], decimals = 18): string[] => {
  return values.map(v => formatUnits(v.toString(), decimals));
};

export const approveToken = async (
  wallet: Web3Provider,
  tokenAddress: string,
  spenderAddress: string,
  amountToApprove?: string,
): Promise<FunctionFragment> => {
  const tokenContract = new Contract(tokenAddress, ERC20ABI, wallet);

  const amountToApproveParsed = amountToApprove
    ? parseEther(amountToApprove)
    : constants.MaxUint256;

  return tokenContract.approve(spenderAddress, amountToApproveParsed);
};

export const getAllowance = async (
  wallet: Web3Provider,
  tokenAddress: string,
  spenderAddress: string,
): Promise<FunctionFragment> => {
  const tokenContract = new Contract(tokenAddress, ERC20ABI, wallet);
  const walletAddress = await wallet._getAddress;

  return tokenContract.allowance(walletAddress, spenderAddress);
};

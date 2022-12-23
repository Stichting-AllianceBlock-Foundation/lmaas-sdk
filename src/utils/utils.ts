import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import { formatUnits, parseEther, parseUnits } from '@ethersproject/units';
import { BigNumber, constants, providers } from 'ethers';

import ERC20ABI from '../abi/ERC20.json';
import { Token, TokenConfigs } from '../entities';

export const day = 60 * 60 * 24;
export const week = day * 7;
export const year = 365;

const BLOCKS_PER_DAY_ETH = 6646;
const BLOCKS_PER_DAY_BSC = 28800;
//polygon average block time 2 sec
const BLOCKS_PER_DAY_POLY = 43200;
//avalanche average block time 2 sec
const BLOCKS_PER_DAY_AVAX = 43200;

export const BLOCKS_COUNT: { [key: string]: any } = {
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

export const stableCoinsIds = ['tether', 'terra-usd', 'usd-coin', 'dai', 'magic-internet-money'];

const SECONDS_PER_BLOCK: { [key: string]: number } = {
  eth: 13,
  bsc: 3,
  polygon: 2,
  avalanche: 2,
  volta: 5,
};

export const convertBlockToSeconds = (blocks: BigNumber, protocol: string) => {
  if (SECONDS_PER_BLOCK[protocol]) {
    const secondsTen = SECONDS_PER_BLOCK[protocol] * 10;
    const blocksPerSecond = blocks.mul(secondsTen);
    const bigTen = BigNumber.from(10);

    return blocksPerSecond.div(bigTen);
  }
  return blocks;
};

export const checkMaxStakingLimit = (limit: BigNumber): boolean => {
  const tenBN = BigNumber.from(10);
  const tenPow18BN = tenBN.pow(18);
  const maxAmount = constants.MaxUint256.div(tenPow18BN);

  return limit.div(tenPow18BN).eq(maxAmount);
};

export const getTokensConfig = (tokens: Token[]): TokenConfigs => {
  const tokenConfigs: TokenConfigs = {};
  if (tokens!.length > 0) {
    tokens!.forEach((el: Token) => {
      tokenConfigs[el.symbol] = el;
    });
  }

  return tokenConfigs;
};

// @tuple    -> array of string respresenting token name
// @returns  -> string of all element of the array concatenated with '-' separater
export const poolTupleToString = (tuple: string[]) => {
  return tuple.join('-');
};

// @wallet  -> wallet object
// @returns -> address of wallet
export const getAddressFromWallet = async (wallet: JsonRpcSigner) => {
  const walletAddress = await wallet.getAddress();
  return walletAddress;
};

export const formatValuesToString = (values: BigNumber[], decimals = 18): string[] => {
  return values.map(v => formatUnits(v.toString(), decimals));
};

export const approveToken = async (
  wallet: JsonRpcProvider | JsonRpcSigner,
  tokenAddress: string,
  spenderAddress: string,
  amountToApprove?: string,
): Promise<providers.TransactionResponse> => {
  const tokenContract = new Contract(tokenAddress, ERC20ABI, wallet);

  const amountToApproveParsed = amountToApprove
    ? parseEther(amountToApprove)
    : constants.MaxUint256;

  return tokenContract.approve(spenderAddress, amountToApproveParsed);
};

export const getAllowance = async (
  wallet: JsonRpcSigner,
  tokenAddress: string,
  spenderAddress: string,
): Promise<BigNumber> => {
  const tokenContract = new Contract(tokenAddress, ERC20ABI, wallet);
  const walletAddress = await wallet.getAddress();

  return tokenContract.allowance(walletAddress, spenderAddress);
};

// formatUnits ( wei , decimalsOrUnitName ) => string
export const formatToken = async (
  walletOrProvider: JsonRpcProvider | JsonRpcSigner,
  value: any,
  tokenAddress: string,
) => {
  return formatUnits(value, await getTokenDecimals(walletOrProvider, tokenAddress));
};

// parseUnits ( valueString , decimalsOrUnitName ) => BigNumber
export const parseToken = async (
  walletOrProvider: JsonRpcProvider | JsonRpcSigner,
  valueString: string,
  tokenAddress: string,
) => {
  return parseUnits(valueString, await getTokenDecimals(walletOrProvider, tokenAddress));
};

export const getBalance = async (
  walletOrProvider: JsonRpcProvider | JsonRpcSigner,
  tokenAddress: string,
  addressToCheck: string,
) => {
  const tokenContract = new Contract(tokenAddress, ERC20ABI, walletOrProvider);
  const balance = await tokenContract.balanceOf(addressToCheck);

  return balance;
};

export const getTotalSupply = async (
  walletOrProvider: JsonRpcProvider | JsonRpcSigner,
  tokenAddress: string,
) => {
  const tokenContract = new Contract(tokenAddress, ERC20ABI, walletOrProvider);
  const supply = await tokenContract.totalSupply();

  return supply;
};

export const getTokenDecimals = async (
  walletOrProvider: JsonRpcProvider | JsonRpcSigner,
  tokenAddress: string,
) => {
  const ethToken = String('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE').toLowerCase();
  if (tokenAddress == ethToken) {
    return 18;
  }

  const tokenContract = new Contract(tokenAddress, ERC20ABI, walletOrProvider);
  const decimals = await tokenContract.decimals();
  return decimals;
};

export function getTokenByPropName(tokenConfig: any, propName: string, propValue: string): any {
  const values = Object.values(tokenConfig);

  return values.find((item: any) => item[propName] === propValue) || {};
}

/**
 * Format duration
 * @private
 * @param {number} duration - Duration in milliseconds
 * @return {string} Duration in days formated
 */
export function formatStakingDuration(duration: number) {
  const durationDays = Math.floor(duration / 1000 / 60 / 60 / 24);

  const durationType = durationDays > 1 ? `Days` : durationDays === 1 ? 'Day' : 'Less than a day';

  return `${durationDays > 0 ? durationDays : ''} ${durationType}`;
}

export function stripDecimalString(string: string, decimals: number) {
  const endPosition = string.indexOf('.') + decimals + 1;
  return string.slice(0, endPosition);
}

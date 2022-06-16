import { FunctionFragment } from '@ethersproject/abi';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcSigner, Web3Provider } from '@ethersproject/providers';
import { formatUnits, parseEther, parseUnits } from '@ethersproject/units';
import { BigNumber, constants } from 'ethers';

import ERC20ABI from '../abi/ERC20.json';

export const day = 60 * 60 * 24;
export const week = day * 7;
export const year = 365;

export const stableCoinsIds = ['tether', 'terra-usd', 'usd-coin', 'dai', 'magic-internet-money'];

export const checkMaxStakingLimit = (limit: BigNumber): boolean => {
  const tenBN = BigNumber.from(10);
  const tenPow18BN = tenBN.pow(18);
  const maxAmount = constants.MaxUint256.div(tenPow18BN);

  return limit.div(tenPow18BN).eq(maxAmount);
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
  wallet: Web3Provider | JsonRpcSigner,
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

// formatUnits ( wei , decimalsOrUnitName ) => string
export const formatToken = async (
  walletOrProvider: Web3Provider | JsonRpcSigner,
  value: any,
  tokenAddress: string,
) => {
  return formatUnits(value, await getTokenDecimals(walletOrProvider, tokenAddress));
};

// parseUnits ( valueString , decimalsOrUnitName ) => BigNumber
export const parseToken = async (
  walletOrProvider: Web3Provider | JsonRpcSigner,
  valueString: string,
  tokenAddress: string,
) => {
  return parseUnits(valueString, await getTokenDecimals(walletOrProvider, tokenAddress));
};

export const getBalance = async (
  walletOrProvider: Web3Provider | JsonRpcSigner,
  tokenAddress: string,
  addressToCheck: string,
) => {
  const tokenContract = new Contract(tokenAddress, ERC20ABI, walletOrProvider);
  const balance = await tokenContract.balanceOf(addressToCheck);

  return balance;
};

export const getTotalSupply = async (
  walletOrProvider: Web3Provider | JsonRpcSigner,
  tokenAddress: string,
) => {
  const tokenContract = new Contract(tokenAddress, ERC20ABI, walletOrProvider);
  const supply = await tokenContract.totalSupply();

  return supply;
};

export const getTokenDecimals = async (
  walletOrProvider: Web3Provider | JsonRpcSigner,
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

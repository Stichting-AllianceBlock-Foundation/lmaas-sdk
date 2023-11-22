import { formatUnits, parseUnits, PublicClient, WalletClient } from 'viem';

import { ERC20ABI } from '../abi/ERC20';
import { Token, TokenConfigs } from '../entities';

export const maxUint256 = BigInt(
  '115792089237316195423570985008687907853269984665640564039457584007913129639935',
); // Equivalent to MaxUint256;

export const day = 60 * 60 * 24;
export const week = day * 7;
export const year = 365;

const BLOCKS_PER_DAY_ETH = 6646;
const BLOCKS_PER_DAY_BSC = 28800;
//polygon average block time 2 sec
const BLOCKS_PER_DAY_POLY = 43200;
//avalanche average block time 2 sec
const BLOCKS_PER_DAY_AVAX = 43200;

export const BLOCKS_COUNT: {
  [key: string]: { PER_DAY: number; PER_WEEK: number; PER_30_DAYS: number };
} = {
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

export const convertBlockToSeconds = (blocks: bigint, protocol: string) => {
  if (SECONDS_PER_BLOCK[protocol]) {
    const secondsTen = BigInt(SECONDS_PER_BLOCK[protocol]) * 10n;
    const blocksPerSecond = blocks * secondsTen;
    return blocksPerSecond / 10n;
  }

  return blocks;
};

export const checkMaxStakingLimit = (limit: bigint): boolean => {
  return limit === maxUint256;
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
export const getAddressFromWallet = async (wallet: WalletClient) => {
  const [walletAddress] = await wallet.getAddresses();
  return walletAddress;
};

export const formatValuesToString = (values: bigint[], decimals = 18): string[] => {
  return values.map(v => formatUnits(v, decimals));
};

export const approveToken = async (
  wallet: WalletClient,
  provider: PublicClient,
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  amountToApprove?: string,
) => {
  const tokenDecimals = await getTokenDecimals(provider, tokenAddress);
  const walletAddress = await getAddressFromWallet(wallet);

  const amountToApproveParsed = amountToApprove
    ? parseUnits(amountToApprove, tokenDecimals)
    : maxUint256;

  try {
    // Simulate approve to check for errors
    await provider.simulateContract({
      abi: ERC20ABI,
      address: tokenAddress,
      functionName: 'approve',
      args: [spenderAddress, amountToApproveParsed],
      account: walletAddress,
      chain: wallet.chain
    });
  } catch (e: any) {
    console.error(e.toString());

    // Check error message
    //if (!e.toString().includes("")) return;

    // Error with approving because this ERC20 version doesn't allow approve when already not 0

    console.log('Trying to approve to 0 first');
  }

  // First approve to 0
  const txHash = await wallet.writeContract({
    abi: ERC20ABI,
    address: tokenAddress,
    functionName: 'approve',
    args: [spenderAddress, 0n],
    account: walletAddress,
    chain: wallet.chain
  });
  await provider.waitForTransactionReceipt({hash: txHash});

  // Then approve to amount
  return await wallet.writeContract({
    abi: ERC20ABI,
    address: tokenAddress,
    functionName: 'approve',
    args: [spenderAddress, amountToApproveParsed],
    account: walletAddress,
    chain: wallet.chain
  });
};

export const getAllowance = async (
  wallet: WalletClient,
  provider: PublicClient,
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
): Promise<bigint> => {
  const walletAddress = await getAddressFromWallet(wallet);

  return await provider.readContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: [walletAddress, spenderAddress],
  });
};

// formatUnits ( wei , decimalsOrUnitName ) => string
export const formatToken = async (
  provider: PublicClient,
  value: bigint | number,
  tokenAddress: `0x${string}`,
) => {
  const parsedValue = typeof value === 'bigint' ? value : BigInt(value);
  return formatUnits(parsedValue, await getTokenDecimals(provider, tokenAddress));
};

// parseUnits ( valueString , decimalsOrUnitName ) => BigNumber
export const parseToken = async (
  provider: PublicClient,
  valueString: string,
  tokenAddress: `0x${string}`,
) => {
  return parseUnits(valueString, await getTokenDecimals(provider, tokenAddress));
};

export const getBalance = async (
  provider: PublicClient,
  tokenAddress: `0x${string}`,
  addressToCheck: `0x${string}`,
) => {
  return await provider.readContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'balanceOf',
    args: [addressToCheck],
  });
};

export const getTotalSupply = async (provider: PublicClient, tokenAddress: `0x${string}`) => {
  return await provider.readContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'totalSupply',
  });
};

export const getTokenDecimals = async (provider: PublicClient, tokenAddress: `0x${string}`) => {
  const ethToken = String('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE').toLowerCase();
  if (tokenAddress == ethToken) {
    return 18;
  }

  return await provider.readContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'decimals',
  });
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

export function minimunBigNumber(firstNumber: bigint, secondNumber: bigint) {
  return firstNumber >= secondNumber ? secondNumber : firstNumber;
}

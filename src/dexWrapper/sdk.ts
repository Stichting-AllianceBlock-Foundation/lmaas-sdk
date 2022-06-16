import { BigNumber, FixedNumber } from '@ethersproject/bignumber';
import { MaxUint256 } from '@ethersproject/constants';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcBatchProvider, JsonRpcSigner, Web3Provider } from '@ethersproject/providers';
import { formatEther, formatUnits, parseEther, parseUnits } from '@ethersproject/units';
import {
  ChainId,
  initSDK,
  NativeCurrency,
  Percent,
  Token,
  TokenAmount,
} from '@stichting-allianceblock-foundation/abdex-sdk-v2';
import { BigNumber as BigNumberJS } from 'bignumber.js';

import {
  approveToken,
  bdiv,
  bmin,
  bnum,
  dexByNetworkMapping,
  DexEnum,
  formatToken,
  getAddressFromWallet,
  getAllowance,
  getBalance,
  getTokenByPropName,
  getTokenDecimals,
  NetworkEnum,
  parseToken,
  stripDecimalString,
  TokenConfigs,
  TokenConfigsProps,
  toWei,
} from '..';

interface GeneralStringToString {
  [key: string]: string;
}

interface FormatedTokens {
  tokenAddress: any;
  convertedAmountBN: BigNumber;
  minAmountBN: BigNumber;
  isNativeToken: boolean;
}

interface AccFormated {
  addresses: string[];
  amounts: BigNumber[];
  minAmounts: BigNumber[];
  lastParam: {
    [key: string]: BigNumber;
  };
  [key: string]: any;
}

// This function is only for AbDex
const getChainIdByNetwork = (network: NetworkEnum): ChainId => {
  switch (network) {
    case NetworkEnum.polygon:
      return ChainId.POLYGON;
    case NetworkEnum.ewc:
      return ChainId.MAIN_EWC;
    default:
      return ChainId.LOCAL;
  }
};
/*
  TODO:

  * Make dexByNetworkMapping more flexible
    * support for testnest addresses
    * support dex versions
  * Get signer from provider
  * Flexible checks for actions
*/

/**
 *  Represents a class that can interact with DEX's
 *  depending on the network.
 *  @constructor
 *  @param {JsonRpcBatchProvider | Web3Provider} provider - Provider with the global interaction.
 *  @param {NetworkEnum} network - Network on which the class DEX has the instance.
 *  @param {TokenConfigs} tokenConfigs - Tokens that are inside of the JSON config configuration.
 */
export class DexWrapper {
  provider: JsonRpcBatchProvider | Web3Provider;
  network: NetworkEnum;
  tokenConfigs: TokenConfigs;
  [key: string]: any;

  constructor(
    provider: JsonRpcBatchProvider | Web3Provider,
    network: NetworkEnum,
    tokenConfigs: TokenConfigs,
  ) {
    this.provider = provider;
    this.network = network;
    this.tokenConfigs = tokenConfigs;
  }

  /**
   * Interact with dex
   * @private
   * @param {string} action - Action type
   * @param {string} dex - Dex
   * @param {object | string} tokensAmountsIn - Tokens data
   * @param {object} wallet - User waller
   * @param {string} poolAddress - LP address
   * @param {array} pair - Array with token symbols
   * @return {object} - minimum token amount
   */
  async interactWithDex(
    action: string,
    dex: DexEnum,
    tokensAmountsIn: string | GeneralStringToString,
    wallet: JsonRpcSigner,
    poolAddress: string,
    pair: string[],
  ) {
    const dexMapping = {
      uniswap: 'interactWithUniswap',
      pangolin: 'interactWithUniswap',
      pancakeswap: 'interactWithUniswap',
      balancer: 'interactWithBalancer',
      quickswap: 'interactWithUniswap',
      alliancedex: 'interactWithAbDex',
      solarflare: 'interactWithUniswap',
    };

    // Compose function name based on version
    const dexMethod = `${dexMapping[dex]}`;

    return this[dexMethod](action, dex, tokensAmountsIn, wallet, poolAddress, pair);
  }

  /**
   * Interact with AllianceBlock dex
   * @private
   * @param {string} action - Action type
   * @param {object | string} _tokensAmountsIn - Tokens data
   * @param {object} wallet - User waller
   * @param {string} poolAddress - LP address
   * @param {array} pair - Array with token symbols
   * @return {object} - minimum token amount
   */
  async interactWithAbDex(
    action: string,
    _dex: DexEnum,
    tokensAmountsIn: string | GeneralStringToString,
    provider: JsonRpcSigner,
    _poolAddress: string,
    pair: string[],
  ) {
    const { nativeToken } = dexByNetworkMapping[this.network];
    const walletAddress = await provider.getAddress();
    const poolWeight = parseEther('0.75');
    (provider as any).address = walletAddress; // @CHECK error inside of the provideLiquidity function, calling provider.address
    const sdkAbDex = await initSDK(provider);
    const dexAb = new sdkAbDex.DEX();

    let transaction;

    if (action === 'removeLiquidity') {
      const token0Data = getTokenByPropName(this.tokenConfigs, TokenConfigsProps.SYMBOL, pair[0]);

      const token1Data = getTokenByPropName(this.tokenConfigs, TokenConfigsProps.SYMBOL, pair[1]);

      const token0 = new Token(
        getChainIdByNetwork(this.network),
        token0Data.address,
        token0Data.decimals,
        token0Data.symbol,
        token0Data.name,
      );

      const token1 = new Token(
        getChainIdByNetwork(this.network),
        token1Data.address,
        token1Data.decimals,
        token1Data.symbol,
        token1Data.name,
      );

      const hasNativeToken =
        token0Data.symbol.substr(1) === nativeToken || token1Data.symbol.substr(1) === nativeToken;

      const poolAb = new sdkAbDex.Pool(token0, token1, poolWeight);
      const userPool = new sdkAbDex.UserContribution(poolAb);

      const tokensAmountsInBN = parseEther(tokensAmountsIn as string);
      const liquidityBN = BigNumber.from((await userPool.liquidity()).raw.toString());
      const fixedTokensAmountsIn = FixedNumber.from(tokensAmountsInBN);
      const fixedLiquidity = FixedNumber.from(liquidityBN);
      const percentage = fixedTokensAmountsIn
        .mulUnsafe(FixedNumber.from('100'))
        .divUnsafe(fixedLiquidity)
        .ceiling()
        .toString();

      const formatedPercentage = tokensAmountsInBN.eq(liquidityBN)
        ? '100'
        : parseInt(percentage, 10).toString();
      const percentToRemove = new Percent(formatedPercentage, '100');
      const slippage = 50;

      transaction = await dexAb.removeLiquidity(percentToRemove, userPool, slippage);

      if (hasNativeToken) {
        transaction = await dexAb.removeNativeLiquidity(percentToRemove, userPool, slippage);
      }
    } else {
      const { hasNativeToken, tokensArr } = this._getTokensData(
        tokensAmountsIn as GeneralStringToString,
        nativeToken,
      );

      const token0 = new Token(
        getChainIdByNetwork(this.network),
        tokensArr[0].tokenAddress,
        tokensArr[0].tokenDecimals,
        tokensArr[0].tokenSymbol,
        tokensArr[0].tokenName,
      );

      const token1 = new Token(
        getChainIdByNetwork(this.network),
        tokensArr[1].tokenAddress,
        tokensArr[1].tokenDecimals,
        tokensArr[1].tokenSymbol,
        tokensArr[1].tokenName,
      );

      const poolAb = new sdkAbDex.Pool(token0, token1, poolWeight);

      if (hasNativeToken) {
        let amount0 = new TokenAmount(token0, tokensArr[0].convertedAmountBN.toBigInt());
        let calculatedAmountB = await (await dexAb.getQuote(poolAb, amount0)).raw.toString();
        let amount1 = NativeCurrency.native(calculatedAmountB, getChainIdByNetwork(this.network));

        if (token0.symbol?.substring(1) === nativeToken) {
          amount0 = new TokenAmount(token1, tokensArr[1].convertedAmountBN.toBigInt());
          calculatedAmountB = await (await dexAb.getQuote(poolAb, amount0)).raw.toString();
          amount1 = NativeCurrency.native(calculatedAmountB, getChainIdByNetwork(this.network));
        }

        transaction = await dexAb.addNativeLiquidity(amount1, amount0, poolAb);
      } else {
        const amount0 = new TokenAmount(token0, tokensArr[0].convertedAmountBN.toBigInt());
        const calculatedAmountB = await (await dexAb.getQuote(poolAb, amount0)).raw.toString();
        const amount1 = new TokenAmount(token1, calculatedAmountB);

        transaction = await dexAb.addLiquidity(amount0, amount1, poolAb);
      }
    }

    return await provider.sendTransaction(transaction);
  }

  /**
   * Interact with Uniswap forks
   * @private
   * @param {string} action - Action type
   * @param {object | string} _tokensAmountsIn - Tokens data
   * @param {object} wallet - User waller
   * @param {string} poolAddress - LP address
   * @param {array} pair - Array with token symbols
   * @return {object} - minimum token amount
   */
  async interactWithUniswap(
    action: string,
    dex: DexEnum,
    _tokensAmountsIn: string | GeneralStringToString,
    provider: JsonRpcSigner,
    poolAddress: string,
    pair: string[],
  ) {
    const { dexes, nativeToken } = dexByNetworkMapping[this.network];
    const { routerAddress, routerABI, poolABI, interactWithNativeSuffix } = dexes[dex];
    const walletAddress = await provider.getAddress();

    let tokensAmountsIn;

    // Get init contracts
    const routerContract = new Contract(routerAddress, routerABI, provider);
    const poolContract = new Contract(poolAddress, poolABI, provider);

    if (action === 'removeLiquidity') {
      // Get pool data
      const { totalSupply: totalSupplyPR, getReserves: getReservesPR } = poolContract;

      const promiseArray = [totalSupplyPR(), getReservesPR()];
      const [poolTotalSupply, poolReserves] = await Promise.all(promiseArray);
      // Format pool data
      const poolTotalSupplyFormated = Number(formatEther(poolTotalSupply.toString()));
      const reserves0Formated = Number(formatEther(poolReserves[0].toString()));
      const reserves1Formated = Number(formatEther(poolReserves[1].toString()));

      const ratio = Number(_tokensAmountsIn) / poolTotalSupplyFormated;
      const token0Ratio = reserves0Formated * ratio;
      const token1Ratio = reserves1Formated * ratio;

      tokensAmountsIn = {
        [pair[0]]: String(token0Ratio),
        [pair[1]]: String(token1Ratio),
      };
    } else {
      tokensAmountsIn = _tokensAmountsIn;
    }

    // Get token data
    const { hasNativeToken, tokensArr } = this._getTokensData(
      tokensAmountsIn as GeneralStringToString,
      nativeToken,
    );

    // Check for provide native liquidity
    const methodName = hasNativeToken ? `${action}${interactWithNativeSuffix}` : `${action}`;

    // Format functions args
    const args =
      action === 'addLiquidity'
        ? this._getFormatFunctionArgumentsProvide(tokensArr, walletAddress)
        : this._getFormatFunctionArgumentsRemove(
            parseEther(_tokensAmountsIn as string),
            tokensArr,
            walletAddress,
          );

    const transaction = await routerContract[methodName](...args);

    return transaction;
  }

  /**
   * Interact with Balancer
   * @private
   * @param {string} action - Action type
   * @param {object | string} _tokensAmountsIn - Tokens data
   * @param {object} wallet - User waller
   * @param {string} poolAddress - LP address
   * @param {array} pair - Array with token symbols
   * @return {object} - minimum token amount
   */
  async interactWithBalancer(
    action: string,
    _tokensAmountsIn: any,
    provider: JsonRpcSigner,
    poolAddress: string,
    pair: string[],
  ) {
    const { dexes } = dexByNetworkMapping[this.network];
    const { poolABI } = dexes['balancer'];
    const walletAddress = await provider.getAddress();

    const poolContract = new Contract(poolAddress, poolABI, provider);

    if (action == 'addLiquidity') {
      // Get pool data
      const { totalSupply: totalSupplyPR, getCurrentTokens: getCurrentTokensPR } = poolContract;
      const promiseArray = [totalSupplyPR(), getCurrentTokensPR()];
      const [poolTotalSupply, currentTokens] = await Promise.all(promiseArray);

      // Calculate tokens to supply ratio
      const { decimals, symbol } = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        currentTokens[0].toLowerCase(),
      );

      /* Legacy code */
      const tokenBalance = await poolContract.getBalance(currentTokens[0]);

      let tokenAmountIn = _tokensAmountsIn[symbol];
      tokenAmountIn = await parseToken(
        this.provider as Web3Provider,
        tokenAmountIn.toString(),
        currentTokens[0],
      );

      const ratio = bnum(tokenAmountIn.toString()).div(tokenBalance.toString());
      const ratioSplitted = ratio.toString().split('.');
      ratioSplitted[1] = ratioSplitted[1].slice(0, decimals);
      const finalRatio = ratioSplitted.join('.');
      const ratioBN = bnum(finalRatio);

      const formattedTotalSupply = await formatToken(
        provider,
        poolTotalSupply.toString(),
        currentTokens[0],
      );

      const buffer = bnum(100);
      const poolAmountOut = ratioBN
        .times(toWei(formattedTotalSupply))
        .integerValue(BigNumberJS.ROUND_DOWN)
        .minus(buffer);
      const maxAmountsIn = [];

      for (const tokenAddress of currentTokens) {
        const tokenName = getTokenByPropName(
          this.tokenConfigs,
          TokenConfigsProps.ADDRESS,
          tokenAddress.toLowerCase(),
        ).symbol;

        const currentTokenBalance = await getBalance(provider, tokenAddress, walletAddress);

        let amount = _tokensAmountsIn[tokenName];
        amount = await parseToken(this.provider as Web3Provider, amount.toString(), tokenAddress);
        //increase the amounts with 1% from what is currently provided
        const amountBN = BigNumber.from(amount).mul(100).div(99);

        const maxAmountIn = bmin(amountBN, currentTokenBalance);
        maxAmountsIn.push(maxAmountIn);
      }
      /* Legacy code */

      const transaction = await poolContract.joinPool(poolAmountOut.toString(10), maxAmountsIn);
      return transaction;
    } else {
      const minAmountsOut = [];

      for (let i = 0; i <= pair.length; i++) {
        const bAmount = new BigNumberJS(0);
        minAmountsOut.push(bAmount.toString(10));
      }

      const bPoolAmountIn = await parseToken(
        this.provider as Web3Provider,
        _tokensAmountsIn.toString(),
        poolAddress,
      );

      const transaction = await poolContract.exitPool(bPoolAmountIn.toString(), minAmountsOut);

      return transaction;
    }
  }

  /**
   * Get user allowance common
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} spenderAddress - Spender address
   * @param {string} tokenAddress - Token address
   * @return {BigNumber} allowance amount as ethers BN
   */
  async getTokenAllowance(userWallet: JsonRpcSigner, spenderAddress: string, tokenAddress: string) {
    // Check for native token
    if (!tokenAddress) {
      return MaxUint256;
    }

    return await getAllowance(userWallet, tokenAddress, spenderAddress);
  }

  /**
   * Approve by token
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} tokenAddress - Token address
   * @param {string} spenderAddress - Spender address
   * @return {object} transaction object
   */
  async approveToken(userWallet: JsonRpcSigner, spenderAddress: string, tokenAddress: string) {
    const receipt = await approveToken(userWallet, tokenAddress, spenderAddress);
    return receipt;
  }

  /**
   * Get balance
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} tokenName - token symbol
   * @return {BigNumber} token balance
   */
  async getBalanceOf(userWallet: JsonRpcSigner, tokenName: string) {
    const { nativeToken } = dexByNetworkMapping[this.network];

    const userAddress = await getAddressFromWallet(userWallet);

    let balance;
    if (tokenName === nativeToken) {
      balance = await this.provider.getBalance(userAddress);

      return balance;
    }

    const tokenAddress = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.SYMBOL,
      tokenName,
    ).address;

    if (tokenAddress == undefined) {
      throw `getBalanceOf: ${tokenName} is not found in configuration`;
    }

    balance = await getBalance(this.provider as Web3Provider, tokenAddress, userAddress);

    return balance;
  }

  /**
   * Get token decimals
   * @public
   * @param {string} tokenName - token symbol
   * @return {number} allowance amount as ethers BN
   */
  async getTokenDecimals(tokenName: string, poolAddress: string) {
    const { nativeToken } = dexByNetworkMapping[this.network];

    if (tokenName === nativeToken) {
      return 18;
    }

    let tokenAddress = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.SYMBOL,
      tokenName,
    ).address;

    if (tokenAddress == undefined) {
      // check if lp token
      tokenAddress = poolAddress;

      if (tokenAddress == undefined) {
        throw `getTokenDecimals: ${tokenName} is not found in configuration`;
      }
    }

    const decimals = await getTokenDecimals(this.provider as Web3Provider, tokenAddress);

    return decimals;
  }

  /**
   * Get price rates
   * @public
   * @param {string} poolAddress - Pool address
   * @param {array} provisionTokensAddresses - Array of underlying token addresses
   * @return {object} price output
   */
  async getAllPriceRates(poolAddress: string, provisionTokensAddresses: string[], dex: DexEnum) {
    const { dexes } = dexByNetworkMapping[this.network];
    const { poolABI } = dexes[dex];
    const sdkAbDex = await initSDK(this.provider.getSigner());

    if (dex === DexEnum.balancer) {
      const output: { [key: string]: GeneralStringToString } = {};

      const tokenNames: string[] = provisionTokensAddresses.map(
        tokenAddress =>
          getTokenByPropName(
            this.tokenConfigs,
            TokenConfigsProps.ADDRESS,
            tokenAddress.toLowerCase(),
          ).symbol,
      );

      const promiseArray = [];
      for (const tokenName of tokenNames) {
        promiseArray.push(this._getPriceRatesBalancer(tokenName, poolAddress, tokenNames));
      }

      const priceRates = await Promise.all(promiseArray);

      priceRates.forEach((rate: GeneralStringToString, index: number) => {
        output[tokenNames[index]] = rate;
      });

      return output;
    } else if (dex === DexEnum.alliancedex) {
      const token0Data = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        provisionTokensAddresses[0].toLocaleLowerCase(),
      );

      const token1Data = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        provisionTokensAddresses[1].toLocaleLowerCase(),
      );

      const token0 = new Token(
        getChainIdByNetwork(this.network),
        token0Data.address,
        token0Data.decimals,
        token0Data.symbol,
        token0Data.name,
      );

      const token1 = new Token(
        getChainIdByNetwork(this.network),
        token1Data.address,
        token1Data.decimals,
        token1Data.symbol,
        token1Data.name,
      );

      const poolWeight = parseEther('0.75');
      const poolAb = new sdkAbDex.Pool(token0, token1, poolWeight);
      const dexAb = new sdkAbDex.DEX();

      const token0Name: any = token0.symbol;
      const token1Name: any = token1.symbol;

      const baseRate0 = new TokenAmount(token0, parseEther('1').toBigInt());
      const baseRate1 = new TokenAmount(token1, parseEther('1').toBigInt());

      const rate0Quote = await dexAb.getQuote(poolAb, baseRate0);
      const rate1Quote = await dexAb.getQuote(poolAb, baseRate1);

      const rate0 = await this._getFormatRateAbDex(
        token1Name,
        token0Name,
        rate0Quote.raw.toString(),
        poolAddress,
      );

      const rate1 = await this._getFormatRateAbDex(
        token0Name,
        token1Name,
        rate1Quote.raw.toString(),
        poolAddress,
      );

      return {
        [token0Name]: {
          [token1Name]: rate0,
        },
        [token1Name]: {
          [token0Name]: rate1,
        },
      };
    } else {
      const poolContract = new Contract(poolAddress, poolABI, this.provider);

      const reserves = poolContract.getReserves();
      let token0Address = poolContract.token0();
      let token1Address = poolContract.token1();
      const result = await Promise.all([reserves, token0Address, token1Address]);

      token0Address = result[1];
      const token0Name = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        token0Address.toLowerCase(),
      ).symbol;
      const token0Reserve = result[0]._reserve0;

      token1Address = result[2];
      const token1Name = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        token1Address.toLowerCase(),
      ).symbol;
      const token1Reserve = result[0]._reserve1;

      return {
        [token0Name]: {
          [token1Name]: await this._getPriceRatesUniswap(
            token1Name,
            token0Name,
            token1Reserve,
            token0Reserve,
            poolAddress,
          ),
        },
        [token1Name]: {
          [token0Name]: await this._getPriceRatesUniswap(
            token0Name,
            token1Name,
            token0Reserve,
            token1Reserve,
            poolAddress,
          ),
        },
      };
    }
  }

  /**
   * Get price rates
   * @private
   * @param {string} tokenName - Token symbol
   * @param {string} poolAddress - Address of the pool
   * @param {array} tokenNames - Token symbols array
   * @return {object} price data object
   */
  async _getPriceRatesBalancer(tokenName: string, poolAddress: string, tokenNames: string[]) {
    const poolContract = new Contract(
      poolAddress,
      dexByNetworkMapping[this.network].dexes.balancer.poolABI,
      this.provider,
    );
    const tokenInAddress = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.SYMBOL,
      tokenName,
    ).address;

    const tokenInDecimals = await getTokenDecimals(this.provider as Web3Provider, tokenInAddress);
    const tokenInBalance = await poolContract.getBalance(tokenInAddress);

    const bTokenInBalance = new BigNumberJS(tokenInBalance.toString());

    const results: GeneralStringToString = {};

    for (const tokenOutName of tokenNames) {
      if (tokenOutName === tokenName) {
        continue;
      }
      const tokenOutAddress: string = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.SYMBOL,
        tokenOutName,
      ).address;

      const tokenOutBalance = await poolContract.getBalance(tokenOutAddress);
      const bTokenOutBalance = new BigNumberJS(tokenOutBalance.toString());

      const price = bdiv(bTokenOutBalance, bTokenInBalance);
      let priceFormatted: string;
      // check if divisor has less than 18 decimals
      if (tokenInDecimals != 18) {
        const tokenOutDecimals = await getTokenDecimals(
          this.provider as Web3Provider,
          tokenOutAddress,
        );
        priceFormatted = formatUnits(price.toString(10), tokenOutDecimals + (18 - tokenInDecimals));
      } else {
        priceFormatted = await formatToken(
          this.provider as Web3Provider,
          price.toString(10),
          tokenOutAddress,
        );
      }

      results[tokenOutName] = priceFormatted;
    }
    return results;
  }

  /**
   * Format rates
   * @private
   * @param {string} token0Name - Token 0 symbol
   * @param {string} token1Name - Token 1 symbol
   * @param {any} rate - Rate amount
   * @param {string} poolAddress - Address of the pool
   * @return {string} rate formatted
   */
  async _getFormatRateAbDex(
    token0Name: string,
    token1Name: string,
    rate: any,
    poolAddress: string,
  ) {
    const token1Decimals = await this.getTokenDecimals(token1Name, poolAddress);
    // check if divisor has less than 18 decimals
    if (token1Decimals != 18) {
      const token0Decimals = await this.getTokenDecimals(token0Name, poolAddress);
      rate = formatUnits(rate.toString(10), token0Decimals + (18 - token1Decimals));
      return rate.substring(0, rate.indexOf('.') + 18);
    }

    const token0Address = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.SYMBOL,
      token0Name,
    ).address;

    rate = await formatToken(this.provider as Web3Provider, rate.toString(10), token0Address);

    return rate;
  }

  /**
   * Get price rates
   * @private
   * @param {string} token0Name - Token 0 symbol
   * @param {string} token1Name - Token 1 symbol
   * @param {number} token0Amount - Token 0 amount
   * @param {number} token1Amount - Token 1 amount
   * @param {string} poolAddress - Address of the pool
   * @return {string} rate
   */
  async _getPriceRatesUniswap(
    token0Name: string,
    token1Name: string,
    token0Amount: number,
    token1Amount: number,
    poolAddress: string,
  ) {
    let rate = bdiv(
      new BigNumberJS(token0Amount.toString()),
      new BigNumberJS(token1Amount.toString()),
    );

    const token1Decimals = await this.getTokenDecimals(token1Name, poolAddress);
    // check if divisor has less than 18 decimals
    if (token1Decimals != 18) {
      const token0Decimals = await this.getTokenDecimals(token0Name, poolAddress);
      rate = formatUnits(rate.toString(10), token0Decimals + (18 - token1Decimals));
      return rate.substring(0, rate.indexOf('.') + 18);
    }

    const token0Address = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.SYMBOL,
      token0Name,
    ).address;

    rate = await formatToken(this.provider as Web3Provider, rate.toString(10), token0Address);

    return rate;
  }

  /**
   * Calculate slippage
   * @private
   * @param {BigNumber} tokenAmount - token amount
   * @param {BigNumber} slippage - slippage
   * @return {BigNumber} - minimum token amount
   */
  _calculateSlippage(tokenAmount: BigNumber, slippage: BigNumber) {
    const hundredBN = BigNumber.from(1000);
    const percentage = BigNumber.from(tokenAmount).mul(slippage).div(hundredBN);
    const minAmount = BigNumber.from(tokenAmount).sub(percentage);

    return minAmount;
  }

  /**
   * Get tokens data
   * @private
   * @param {object} tokensAmountsIn - Object with token data from form
   * @param {string} nativeToken - Native token symbol
   * @return {object} - Object with hasNativeToken and tokensArr
   */
  _getTokensData(tokensAmountsIn: GeneralStringToString, nativeToken: string) {
    const tokensArr = [];

    let hasNativeToken = false;

    // Get token data
    for (const tokenSymbol in tokensAmountsIn) {
      const isNativeToken = tokenSymbol === nativeToken;

      if (isNativeToken) {
        hasNativeToken = true;
      }

      const tokenData = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.SYMBOL,
        tokenSymbol,
      );

      // Convert to wei
      const tokenDecimals = isNativeToken ? 18 : tokenData.decimals;
      const slippage = 5;
      const slippageBN = BigNumber.from(slippage);

      const strippedAmount = stripDecimalString(tokensAmountsIn[tokenSymbol], tokenDecimals);

      const convertedAmountBN = parseUnits(strippedAmount, tokenDecimals);

      const minAmountBN = this._calculateSlippage(convertedAmountBN, slippageBN);

      tokensArr.push({
        tokenAddress: tokenData.address,
        convertedAmountBN,
        minAmountBN,
        isNativeToken,
        tokenDecimals,
        tokenSymbol,
        tokenName: tokenData.name,
      });
    }

    return {
      tokensArr,
      hasNativeToken,
    };
  }

  /**
   * Format arguments for Provide liquidity function
   * @private
   * @param {array} tokensArr - Array with formated token data
   * @param {string} walletAddress - Wallet address
   * @param {string} action - Dex action
   * @return {array} - Array with formated args
   */
  _getFormatFunctionArgumentsProvide(tokensArr: FormatedTokens[], walletAddress: string) {
    const initialAgrsState = {
      addresses: [],
      amounts: [],
      minAmounts: [],
      lastParam: {},
    };

    let nativeTokenMinAmount = BigNumber.from(0);

    const reduceTokenArgs = (acc: AccFormated, item: FormatedTokens) => {
      if (!item.isNativeToken) {
        acc['addresses'].push(item.tokenAddress);
        acc['amounts'].push(item.convertedAmountBN);
        acc['minAmounts'].push(item.minAmountBN);
      } else {
        acc['lastParam'] = { value: item.convertedAmountBN };
        nativeTokenMinAmount = item.minAmountBN;
      }

      return acc;
    };

    const argsObject = tokensArr.reduce(reduceTokenArgs, initialAgrsState);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 60;

    if (nativeTokenMinAmount.gt(BigNumber.from(0))) {
      argsObject.minAmounts.push(nativeTokenMinAmount);
    }

    const args = [
      ...argsObject['addresses'],
      ...argsObject['amounts'],
      ...argsObject['minAmounts'],
      walletAddress,
      deadline,
      argsObject['lastParam'],
    ];

    return args;
  }

  /**
   * Format arguments for Remove liquidity function
   * @private
   * @param {BigNumber} amountLP - Amount of LP tokens to be removed
   * @param {array} tokensArr - Array with formated token data
   * @param {string} walletAddress - Wallet address
   * @param {string} action - Dex action
   * @return {array} - Array with formated args
   */
  _getFormatFunctionArgumentsRemove(
    amountLP: BigNumber,
    tokensArr: FormatedTokens[],
    walletAddress: string,
  ) {
    const initialAgrsState = {
      addresses: [],
      amounts: [],
      minAmounts: [],
      lastParam: {},
    };

    const reduceTokenArgs = (acc: AccFormated, item: FormatedTokens) => {
      if (!item.isNativeToken) {
        acc['addresses'].push(item.tokenAddress);
        acc['amounts'].push(item.convertedAmountBN);
      }

      acc['minAmounts'].push(item.minAmountBN);

      return acc;
    };

    const argsObject = tokensArr.reduce(reduceTokenArgs, initialAgrsState);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 60;

    const args = [
      ...argsObject['addresses'],
      amountLP,
      ...argsObject['minAmounts'],
      walletAddress,
      deadline,
    ];

    return args;
  }
}

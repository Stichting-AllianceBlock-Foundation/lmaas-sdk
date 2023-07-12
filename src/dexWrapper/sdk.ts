import { formatEther, formatUnits, parseEther, parseUnits, PublicClient, WalletClient } from 'viem';

import {
  approveToken,
  bdiv,
  bmin,
  dexByNetworkMapping,
  DexEnum,
  formatToken,
  getAddressFromWallet,
  getAllowance,
  getBalance,
  getTokenByPropName,
  getTokenDecimals,
  maxUint256,
  NetworkEnum,
  parseToken,
  stripDecimalString,
  TokenConfigs,
  TokenConfigsProps,
} from '..';

interface GeneralStringToString {
  [key: string]: string;
}

interface FormatedTokens {
  tokenAddress: any;
  convertedAmountBN: bigint;
  minAmountBN: bigint;
  isNativeToken: boolean;
}

interface AccFormated {
  addresses: string[];
  amounts: bigint[];
  minAmounts: bigint[];
  lastParam: {
    [key: string]: bigint;
  };
  [key: string]: any;
}

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
 *  @param {PublicClient} provider - Provider with the global interaction.
 *  @param {NetworkEnum} network - Network on which the class DEX has the instance.
 *  @param {TokenConfigs} tokenConfigs - Tokens that are inside of the JSON config configuration.
 */
export class DexWrapper {
  provider: PublicClient;
  network: NetworkEnum;
  tokenConfigs: TokenConfigs;
  [key: string]: any;

  constructor(provider: PublicClient, network: NetworkEnum, tokenConfigs: TokenConfigs) {
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
    wallet: WalletClient,
    poolAddress: string,
    pair: string[],
  ) {
    const dexMapping = {
      uniswap: 'interactWithUniswap',
      pangolin: 'interactWithUniswap',
      pancakeswap: 'interactWithUniswap',
      balancer: 'interactWithBalancer',
      quickswap: 'interactWithUniswap',
      solarflare: 'interactWithUniswap',
      arrakis: 'interactWithUniswap',
    };

    // Compose function name based on version
    const dexMethod = `${dexMapping[dex]}`;

    return this[dexMethod](action, dex, tokensAmountsIn, wallet, poolAddress, pair);
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
    wallet: WalletClient,
    poolAddress: string,
    pair: string[],
  ) {
    const { dexes, nativeToken } = dexByNetworkMapping[this.network];
    const { routerAddress, interactWithNativeSuffix, poolABI, routerABI } = dexes[dex];
    const walletAddress = await getAddressFromWallet(wallet);

    let tokensAmountsIn;

    if (action === 'removeLiquidity') {
      // Get pool data
      let getReservesPR: Promise<[bigint, bigint]>;

      if (dex === DexEnum.arrakis) {
        getReservesPR = this.provider.readContract({
          abi: poolABI,
          address: poolAddress as `0x${string}`,
          functionName: 'getUnderlyingBalances',
        }) as Promise<[bigint, bigint]>;
      } else {
        getReservesPR = this.provider.readContract({
          abi: poolABI,
          address: poolAddress as `0x${string}`,
          functionName: 'getReserves',
        }) as Promise<[bigint, bigint]>;
      }

      const totalSupplyPR = this.provider.readContract({
        abi: poolABI,
        address: poolAddress as `0x${string}`,
        functionName: 'totalSupply',
      }) as Promise<bigint>;

      const [totalSupply, poolReserves] = await Promise.all([totalSupplyPR, getReservesPR]);
      // Format pool data
      const poolTotalSupplyFormated = Number(formatEther(totalSupply));
      const reserves0Formated = Number(formatEther(poolReserves[0]));
      const reserves1Formated = Number(formatEther(poolReserves[1]));

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

    if (dex === DexEnum.arrakis) {
      const configuredArgs = [...args];

      // this is only an extra step that takes the arrakis router
      configuredArgs.splice(0, 2, poolAddress);

      // calculating the minAmounts and minMintedAmount by arrakis vault
      const [amount0, amount1, mintAmount] = (await this.provider.readContract({
        address: poolAddress as `0x${string}`,
        abi: poolABI,
        functionName: 'getMintAmounts',
        args: [
          action === 'addLiquidity' ? configuredArgs[1] : configuredArgs[2],
          action === 'addLiquidity' ? configuredArgs[2] : configuredArgs[3],
        ],
      })) as [bigint, bigint, bigint];

      const amount0Min = (amount0 * 95n) / 100n;
      const amount1Min = (amount1 * 95n) / 100n;
      const amountSharesMin = (mintAmount * 95n) / 100n;

      if (action === 'removeLiquidity') {
        configuredArgs.splice(5, 1);
        configuredArgs.splice(2, 2, amount0Min, amount1Min);

        const { request } = await this.provider.simulateContract({
          abi: routerABI,
          address: routerAddress as `0x${string}`,
          functionName: methodName,
          args: [...configuredArgs],
        });

        return await wallet.writeContract(request);
      }

      // this is only an extra step that takes the arrakis router
      configuredArgs.splice(6, 1);

      configuredArgs.splice(3, 2, amount0Min, amount1Min);
      configuredArgs.splice(5, 0, amountSharesMin);

      const { request } = await this.provider.simulateContract({
        abi: routerABI,
        address: routerAddress as `0x${string}`,
        functionName: methodName,
        args: [...configuredArgs],
      });

      return await wallet.writeContract(request);
    }

    const { request } = await this.provider.simulateContract({
      abi: routerABI,
      address: routerAddress as `0x${string}`,
      functionName: methodName,
      args: [...args],
    });

    return await wallet.writeContract(request);
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
    wallet: WalletClient,
    poolAddress: string,
    pair: string[],
  ) {
    const { dexes } = dexByNetworkMapping[this.network];
    const { poolABI } = dexes['balancer'];
    const walletAddress = await getAddressFromWallet(wallet);

    if (action == 'addLiquidity') {
      // Get pool data
      const totalSupplyPR = this.provider.readContract({
        abi: poolABI,
        address: poolAddress as `0x${string}`,
        functionName: 'totalSupply',
      }) as Promise<bigint>;

      const getCurrentTokensPR = this.provider.readContract({
        abi: poolABI,
        address: poolAddress as `0x${string}`,
        functionName: 'getCurrentTokens',
      }) as Promise<[`0x${string}`]>;

      const [poolTotalSupply, currentTokens] = await Promise.all([
        totalSupplyPR,
        getCurrentTokensPR,
      ]);

      // Calculate tokens to supply ratio
      const { symbol } = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        currentTokens[0].toLowerCase(),
      );

      const tokenBalance = (await this.provider.readContract({
        abi: poolABI,
        address: poolAddress as `0x${string}`,
        functionName: 'getBalance',
        args: [currentTokens[0]],
      })) as bigint;

      const tokenAmountIn = _tokensAmountsIn[symbol];
      const parsedTokenAmountIn = await parseToken(this.provider, tokenAmountIn, currentTokens[0]);

      const ratio = parsedTokenAmountIn / tokenBalance;

      const poolAmountOut = ratio * poolTotalSupply;
      const maxAmountsIn: bigint[] = [];

      for (const tokenAddress of currentTokens) {
        const tokenName = getTokenByPropName(
          this.tokenConfigs,
          TokenConfigsProps.ADDRESS,
          tokenAddress.toLowerCase(),
        ).symbol;

        const currentTokenBalance = await getBalance(this.provider, tokenAddress, walletAddress);

        const amount = _tokensAmountsIn[tokenName];
        const parsedAmount = await parseToken(this.provider, amount.toString(), tokenAddress);
        //increase the amounts with 1% from what is currently provided
        const amountIncreased = (parsedAmount * 100n) / 99n;

        const maxAmountIn = bmin(amountIncreased, currentTokenBalance);
        maxAmountsIn.push(maxAmountIn);
      }

      const { request } = await this.provider.simulateContract({
        abi: poolABI,
        address: poolAddress as `0x${string}`,
        functionName: 'joinPool',
        args: [poolAmountOut, maxAmountsIn],
      });

      return await wallet.writeContract(request);
    } else {
      const minAmountsOut: bigint[] = [];

      for (let i = 0; i <= pair.length; i++) {
        minAmountsOut.push(0n);
      }

      const bPoolAmountIn = await parseToken(
        this.provider,
        _tokensAmountsIn.toString(),
        poolAddress as `0x${string}`,
      );

      const { request } = await this.provider.simulateContract({
        abi: poolABI,
        address: poolAddress as `0x${string}`,
        functionName: 'exitPool',
        args: [bPoolAmountIn, minAmountsOut],
      });

      return await wallet.writeContract(request);
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
  async getTokenAllowance(
    wallet: WalletClient,
    spenderAddress: string,
    tokenAddress: string,
  ): Promise<bigint> {
    // Check for native token
    if (!tokenAddress) {
      return maxUint256;
    }

    return await getAllowance(
      wallet,
      this.provider,
      tokenAddress as `0x${string}`,
      spenderAddress as `0x${string}`,
    );
  }

  /**
   * Approve by token
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} tokenAddress - Token address
   * @param {string} spenderAddress - Spender address
   * @return {object} transaction object
   */
  async approveToken(
    wallet: WalletClient,
    spenderAddress: string,
    tokenAddress: string,
    amountToApprove?: string,
  ) {
    return await approveToken(
      wallet,
      this.provider,
      tokenAddress as `0x${string}`,
      spenderAddress as `0x${string}`,
      amountToApprove,
    );
  }

  /**
   * Get balance
   * @public
   * @param {object} userWallet - Provider object
   * @param {string} tokenName - token symbol
   * @return {BigNumber} token balance
   */
  async getBalanceOf(wallet: WalletClient, tokenName: string) {
    const { nativeToken } = dexByNetworkMapping[this.network];

    const userAddress = await getAddressFromWallet(wallet);

    let balance: bigint = 0n;

    if (tokenName === nativeToken) {
      balance = await this.provider.getBalance({ address: userAddress, blockTag: 'safe' });

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

    balance = await getBalance(this.provider, tokenAddress, userAddress);

    return balance;
  }

  /**
   * Get token decimals
   * @public
   * @param {string} tokenName - token symbol
   * @return {number} allowance amount as ethers BN
   */
  public async getTokenDecimals(tokenName: string, poolAddress: string) {
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

    const decimals = await getTokenDecimals(this.provider, tokenAddress);

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
    } else {
      const reserves =
        dex === DexEnum.arrakis
          ? (this.provider.readContract({
              abi: poolABI,
              address: poolAddress as `0x${string}`,
              functionName: 'getUnderlyingBalances',
            }) as Promise<[bigint, bigint]>)
          : (this.provider.readContract({
              abi: poolABI,
              address: poolAddress as `0x${string}`,
              functionName: 'getReserves',
            }) as Promise<[bigint, bigint]>);

      const token0 = this.provider.readContract({
        abi: poolABI,
        address: poolAddress as `0x${string}`,
        functionName: 'token0',
      }) as Promise<`0x${string}`>;
      const token1 = this.provider.readContract({
        abi: poolABI,
        address: poolAddress as `0x${string}`,
        functionName: 'token1',
      }) as Promise<`0x${string}`>;

      const result = await Promise.all([reserves, token0, token1]);

      const token0Address = result[1];

      const token0Name = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        token0Address.toLowerCase(),
      ).symbol;

      const token0Reserve = dex === DexEnum.arrakis ? result[0][0] : result[0][0];

      const token1Address = result[2];

      const token1Name = getTokenByPropName(
        this.tokenConfigs,
        TokenConfigsProps.ADDRESS,
        token1Address.toLowerCase(),
      ).symbol;

      const token1Reserve = dex === DexEnum.arrakis ? result[0][1] : result[0][1];

      return {
        [token0Name]: {
          [token1Name]: await this._getPriceRatesUniswap(
            token1Name,
            token0Name,
            token1Reserve,
            token0Reserve,
            poolAddress as `0x${string}`,
          ),
        },
        [token1Name]: {
          [token0Name]: await this._getPriceRatesUniswap(
            token0Name,
            token1Name,
            token0Reserve,
            token1Reserve,
            poolAddress as `0x${string}`,
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
  private async _getPriceRatesBalancer(
    tokenName: string,
    poolAddress: string,
    tokenNames: string[],
  ) {
    const tokenInAddress = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.SYMBOL,
      tokenName,
    ).address;

    const tokenInDecimals = await getTokenDecimals(this.provider, tokenInAddress);
    const tokenInBalance = (await this.provider.readContract({
      address: poolAddress as `0x${string}`,
      abi: dexByNetworkMapping[this.network].dexes.balancer.poolABI,
      functionName: 'getBalance',
      args: [tokenInAddress],
    })) as bigint;

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

      const tokenOutBalance = (await this.provider.readContract({
        address: poolAddress as `0x${string}`,
        abi: dexByNetworkMapping[this.network].dexes.balancer.poolABI,
        functionName: 'getBalance',
        args: [tokenOutAddress],
      })) as bigint;

      const price = bdiv(tokenOutBalance, tokenInBalance);

      let priceFormatted = '0';
      // check if divisor has less than 18 decimals
      if (tokenInDecimals != 18) {
        const tokenOutDecimals = await getTokenDecimals(
          this.provider,
          tokenOutAddress as `0x${string}`,
        );
        priceFormatted = formatUnits(price, tokenOutDecimals + (18 - tokenInDecimals));
      } else {
        priceFormatted = await formatToken(this.provider, price, tokenOutAddress as `0x${string}`);
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

    rate = await formatToken(this.provider, rate.toString(10), token0Address);

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
  private async _getPriceRatesUniswap(
    token0Name: string,
    token1Name: string,
    token0Amount: bigint,
    token1Amount: bigint,
    poolAddress: `0x${string}`,
  ) {
    const rate = bdiv(token0Amount, token1Amount);

    const token1Decimals = await this.getTokenDecimals(token1Name, poolAddress);

    // check if divisor has less than 18 decimals
    if (token1Decimals != 18) {
      const token0Decimals = await this.getTokenDecimals(token0Name, poolAddress);
      return formatUnits(rate, token0Decimals + (18 - token1Decimals));
    }

    const token0Address = getTokenByPropName(
      this.tokenConfigs,
      TokenConfigsProps.SYMBOL,
      token0Name,
    ).address;

    return await formatToken(this.provider, rate, token0Address);
  }

  /**
   * Calculate slippage
   * @private
   * @param {bigint} tokenAmount - token amount
   * @param {bigint} slippage - slippage
   * @return {bigint} - minimum token amount
   */
  private _calculateSlippage(tokenAmount: bigint, slippage: bigint): bigint {
    const hundredBN = 1000n;
    const percentage = (tokenAmount * slippage) / hundredBN;
    const minAmount = tokenAmount - percentage;

    return minAmount;
  }

  /**
   * Get tokens data
   * @private
   * @param {object} tokensAmountsIn - Object with token data from form
   * @param {string} nativeToken - Native token symbol
   * @return {object} - Object with hasNativeToken and tokensArr
   */
  private _getTokensData(tokensAmountsIn: GeneralStringToString, nativeToken: string) {
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
      const slippage = 5n;

      const strippedAmount = stripDecimalString(tokensAmountsIn[tokenSymbol], tokenDecimals);

      const convertedAmountBN = parseUnits(strippedAmount, tokenDecimals);

      const minAmount = this._calculateSlippage(convertedAmountBN, slippage);

      tokensArr.push({
        tokenAddress: tokenData.address,
        convertedAmountBN,
        minAmountBN: minAmount,
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
  private _getFormatFunctionArgumentsProvide(tokensArr: FormatedTokens[], walletAddress: string) {
    const initialAgrsState = {
      addresses: [],
      amounts: [],
      minAmounts: [],
      lastParam: {},
    };

    let nativeTokenMinAmount = 0n;

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

    if (nativeTokenMinAmount > 0n) {
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
   * @param {bigint} amountLP - Amount of LP tokens to be removed
   * @param {array} tokensArr - Array with formated token data
   * @param {string} walletAddress - Wallet address
   * @param {string} action - Dex action
   * @return {array} - Array with formated args
   */
  private _getFormatFunctionArgumentsRemove(
    amountLP: bigint,
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

    if (tokensArr[0].isNativeToken) {
      const minAmountNative = [argsObject['minAmounts'][1], argsObject['minAmounts'][0]];

      const args = [
        ...argsObject['addresses'],
        amountLP,
        ...minAmountNative,
        walletAddress,
        deadline,
      ];

      return args;
    }

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

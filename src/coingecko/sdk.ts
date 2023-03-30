import axios from 'axios';

const coingeckoAPI = 'https://api.coingecko.com/api/v3';

export class CoinGecko {
  minutesForExpiration: number;
  httpStatus?: number;
  errorCode?: string;

  constructor(minutesToExpire: number) {
    this.minutesForExpiration = minutesToExpire;
  }

  /**
   *  Represents a class that can interact with DEX's
   *  depending on the network.
   *  @param {string} tokenId - Id of the token that we want to search the price.
   *  @param {string} currency - Currency on which we want the price, ex: `usd`, `eur`.
   */
  async getTokenPrice(tokenId: string, currency: string) {
    let usdPrices: { [key: string]: { [key: string]: number; expiration: number } } | null = null;
    const secondsForExpiration = this.minutesForExpiration * 60;
    const currentTimestamp = Math.floor(Date.now() / 1000);

    try {
      usdPrices = JSON.parse(localStorage.getItem('usd_prices')!);
    } catch (error) {
      console.error(error);
    }

    if (usdPrices) {
      if (usdPrices[tokenId] && usdPrices[tokenId].expiration > currentTimestamp) {
        if (usdPrices[tokenId][currency]) {
          return usdPrices[tokenId][currency];
        }
      }
    }

    let price = 0;

    try {
      const response = await axios.get(coingeckoAPI + `/simple/price`, {
        params: {
          ids: tokenId,
          vs_currencies: currency,
        },
      });

      const statusCode = response.status;

      this.httpStatus = statusCode;

      if (statusCode >= 300 || statusCode < 200) {
        this.errorCode = statusCode.toString();
      }
      price = response.data[tokenId][currency];
    } catch (error) {
      this.httpStatus = (error as any).response.status || 0;
      this.errorCode = (error as any).code || '';
    }

    if (usdPrices) {
      usdPrices = {
        ...usdPrices,
        [tokenId]: {
          [currency]: price,
          expiration: currentTimestamp + secondsForExpiration,
        },
      };

      localStorage.setItem('usd_prices', JSON.stringify(usdPrices));

      return price;
    }

    usdPrices = {
      [tokenId]: {
        [currency]: price,
        expiration: currentTimestamp + secondsForExpiration,
      },
    };

    localStorage.setItem('usd_prices', JSON.stringify(usdPrices));

    return price;
  }
}

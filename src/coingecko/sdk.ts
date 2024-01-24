import axios from 'axios';

const coingeckoAPI = 'https://api.coingecko.com/api/v3';
const coingeckoProAPI = 'https://pro-api.coingecko.com/api/v3';

export interface CoinGeckoConfig {
  apiKey?: string;
  fallbackUrl?: string;
  minutesForExpiration: number;
  url?: string;
}
export class CoinGecko {
  minutesForExpiration: number;
  httpStatus?: number;
  errorCode?: string;
  coingeckoApiKey?: string;
  coingeckoApiUrl: string;
  coingeckoFallbackUrl?: string;

  constructor(minutesToExpire: number | CoinGeckoConfig) {
    if (typeof minutesToExpire === 'number') {
      this.coingeckoApiUrl = coingeckoAPI;
      this.minutesForExpiration = minutesToExpire;
      return;
    }

    this.minutesForExpiration = minutesToExpire.minutesForExpiration;
    this.coingeckoApiKey = minutesToExpire.apiKey;
    this.coingeckoApiUrl =
      minutesToExpire.url || this.coingeckoApiKey ? coingeckoProAPI : coingeckoAPI;
    this.coingeckoFallbackUrl = minutesToExpire.fallbackUrl;
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

    const price =
      (await this.fetchCoingeckoPrice({
        ids: tokenId,
        vs_currencies: currency,
        ...(this.coingeckoApiKey && { x_cg_pro_api_key: this.coingeckoApiKey }),
      })) || 0;

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

  async fetchCoingeckoPrice(
    params: { ids: string; vs_currencies: string; x_cg_pro_api_key?: string },
    useFallback = false,
  ): Promise<any> {
    try {
      const baseUrl = useFallback ? this.coingeckoFallbackUrl : this.coingeckoApiUrl;

      const response = await axios.get(baseUrl + `/simple/price`, {
        params,
      });
      const statusCode = response.status;

      this.httpStatus = statusCode;

      return response.data[params.ids][params.vs_currencies];
    } catch (error) {
      console.error(error);

      if (this.coingeckoFallbackUrl && !useFallback) {
        return await this.fetchCoingeckoPrice(params, true);
      }
    }
  }
}

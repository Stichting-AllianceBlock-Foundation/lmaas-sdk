import axios from 'axios';

const coingeckoAPI = 'https://api.coingecko.com/api/v3';
const transposeAPI = 'https://api.transpose.io/sql';

export class CoinGecko {
  minutesForExpiration: number;

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

    let response;

    // note: this is only for BEUR, delete in the future if not needed anymore
    if (tokenId === 'bonq') {
      response = {
        data: {
          bonq: {
            usd: 0.03,
          },
        },
      };
    } else if (tokenId === 'beur') {
      // call to an external API
      const resultTranspose = await axios.post(
        transposeAPI,
        {
          sql: `SELECT effective_price FROM polygon.dex_swaps
            WHERE contract_address IN (
            '0x0066ead4772591b62dC72929AEF13F7DDE1B4374',
            '0x0792130d3c17c58B6320a4aeb70DF8b5eE559ECc',
            '0xb14900b0eE6E50dD535e02Ac2195c37690407a15',
            '0x4f5f469781cE3A294EE22759B0c4822F0C6178A1',
            '0x559Bd861FAEB53605bfF0FEe54500f07912c31cB')
            AND from_token_address = '0x338Eb4d394a4327E5dB80d08628fa56EA2FD4B81'
            ORDER BY timestamp DESC
            LIMIT 1`,
        },
        {
          headers: {
            'X-API-KEY': 'xBqXAdus6ETXuEKKlAxPTPQBnfg8V2tM',
          },
        },
      );

      response = {
        data: {
          beur: {
            usd: resultTranspose.data.results[0].effective_price,
          },
        },
      };
    } else {
      response = await axios.get(coingeckoAPI + `/simple/price`, {
        params: {
          ids: tokenId,
          vs_currencies: currency,
        },
      });
    }

    if (usdPrices) {
      usdPrices = {
        ...usdPrices,
        [tokenId]: {
          [currency]: response.data[tokenId][currency],
          expiration: currentTimestamp + secondsForExpiration,
        },
      };

      localStorage.setItem('usd_prices', JSON.stringify(usdPrices));

      return response.data[tokenId][currency];
    }

    usdPrices = {
      [tokenId]: {
        [currency]: response.data[tokenId][currency],
        expiration: currentTimestamp + secondsForExpiration,
      },
    };

    localStorage.setItem('usd_prices', JSON.stringify(usdPrices));

    return response.data[tokenId][currency];
  }
}

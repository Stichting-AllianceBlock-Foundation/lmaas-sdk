import axios from 'axios';

const coingeckoAPI = 'https://api.coingecko.com/api/v3';

export class CoinGecko {
  /**
   *  Represents a class that can interact with DEX's
   *  depending on the network.
   *  @param {string} tokenId - Id of the token that we want to search the price.
   *  @param {string} currency - Currency on which we want the price, ex: `usd`, `eur`.
   */
  async getTokenPrice(tokenId: string, currency: string) {
    const response = await axios.get(coingeckoAPI + `/simple/price`, {
      params: {
        ids: tokenId,
        vs_currencies: currency,
      },
    });
    return response.data[tokenId][currency];
  }
}

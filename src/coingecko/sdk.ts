import axios from 'axios';

const coingeckoAPI = 'https://api.coingecko.com/api/v3';

export class CoinGecko {
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

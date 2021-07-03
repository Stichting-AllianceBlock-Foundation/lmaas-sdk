import { ethers } from 'ethers';

class Client {
  provider: any;
  network: number;

  constructor(_network: number) {
    this.network = _network;
  }

  connectWithInfura(APIkey: string) {
    this.provider = new ethers.providers.InfuraProvider(this.network, APIkey);
  }

  connectWitJSONRPC(url: string) {
    this.provider = new ethers.providers.JsonRpcProvider(url);
  }
}

export default Client;

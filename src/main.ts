import CONFIG from './config/config';
import Client from './Client';
import { ethers } from 'ethers';
import LMC from './LMC';

(async function () {
  // Init client
  const client: Client = new Client(CONFIG.network);

  // Connect to network
  client.connectWithInfura(CONFIG.APIKey);

  // Init wallet
  const userWallet = new ethers.Wallet(CONFIG.privateKey, client.provider);

  // Get LMC instance
  const LMCInstance = new LMC(userWallet, '0x44e29f82cee755488d42296e6a9c9a6037696483');

  // Get LMC data
  await LMCInstance.getCampaignData(client.provider);

  console.log(LMCInstance);
})();

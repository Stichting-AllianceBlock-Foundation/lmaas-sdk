import CONFIG from './config/config';
import Client from './Client';
import { ethers } from 'ethers';

const liquidityMiningCampaignABI = require('./abi/LiquidityMiningCampaign.json');

(async function () {
  // Init client
  const client: Client = new Client(CONFIG.network);

  // Connect to network
  client.connectWithInfura(CONFIG.APIKey);

  // Init wallet
  const userWallet = new ethers.Wallet(CONFIG.privateKey, client.provider);

  // Get contract
  const stakingRewardsContract = new ethers.Contract(
    '0x44e29f82cee755488d42296e6a9c9a6037696483',
    liquidityMiningCampaignABI,
    userWallet,
  );

  // Log contract data
  console.log(stakingRewardsContract);
})();

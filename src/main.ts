import CONFIG from './config/config';
import Client from './Client';
import { ethers } from 'ethers';
import { LiquidityMiningCampaign__factory } from './abi/index';

(async function () {
  // Init client
  const client: Client = new Client(CONFIG.network);

  // Connect to network
  client.connectWithInfura(CONFIG.APIKey);

  // Init wallet
  const userWallet = new ethers.Wallet(CONFIG.privateKey, client.provider);

  // Get contract
  const stakingRewardsContract = LiquidityMiningCampaign__factory.connect(
    '0x44e29f82cee755488d42296e6a9c9a6037696483',
    userWallet,
  );

  const totalStaked = await stakingRewardsContract.totalStaked();
  console.log(ethers.utils.formatEther(totalStaked));
})();

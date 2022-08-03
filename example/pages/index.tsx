import { useWeb3React } from '@web3-react/core';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useGlobalContext } from './_app';
import { getProtocolByChainId, injected } from '../utils/utils';
import { useEffect, useState } from 'react';
import { Web3Provider } from '@ethersproject/providers';
import {
  ConfigWrapper,
  StakerSDK,
  StakingInterface,
} from '@stichting-allianceblock-foundation/lmaas-sdk';

function getSDK(
  chainId: number,
  provider: Web3Provider,
  configWrapper: ConfigWrapper,
): StakerSDK | null {
  let sdk: StakerSDK | null = null;

  if (chainId && configWrapper.config) {
    sdk = new StakerSDK(provider, getProtocolByChainId(chainId), configWrapper.config.config);
  }

  return sdk;
}

enum TokenConfigsProps {
  ADDRESS = 'address',
  ID = 'id',
  SYMBOL = 'symbol',
  NAME = 'name',
  PROJECT_TOKEN = 'projectToken',
}

function getTokenByPropName(tokenConfig: any, propName: TokenConfigsProps, propValue: any): any {
  const values = Object.values(tokenConfig);

  return values.find((item: any) => item[propName] === propValue) || {};
}

const Home: NextPage = () => {
  const { stakerSdk, configWrapper, setStakerSdk } = useGlobalContext();
  const { activate, active, library, chainId, account } = useWeb3React();
  const [lmCampaigns, setLmCampaigns] = useState<any[]>([]);
  const [stakingCampaigns, setStakingCampaigns] = useState<any[]>([]);
  const [loadingLmCampaigns, setLoadingLmCampaigns] = useState<boolean>(false);
  const [loadingStakingCampaigns, setLoadingStakingCampaigns] = useState<boolean>(false);
  const [pendingTx, setPendingTx] = useState<boolean>(false);

  useEffect(() => {
    const sdk = getSDK(chainId!, library, configWrapper!);
    setStakerSdk(sdk);
  }, [chainId, active, account]);

  useEffect(() => {
    async function fetchStakingCampaignInfo() {
      const configCampaigns = configWrapper!.getStakingCampaigns(
        getProtocolByChainId(chainId!),
        item => item.version === '2.0', // The SDK only works with V2 campaigns, not V1 supported
      );
      const signer = await library.getSigner();

      const cardDataPR = configCampaigns.map(campaign =>
        stakerSdk?.soloStakerWrapper.getCardData(signer, campaign),
      );

      try {
        setLoadingStakingCampaigns(true);
        const cardDataFull = await Promise.all(cardDataPR);
        setStakingCampaigns(cardDataFull);
        setLoadingStakingCampaigns(false);
      } catch (e) {
        console.error(e);
      }
    }

    if (library && active && stakerSdk) {
      fetchStakingCampaignInfo();
    }

    return () => {
      setStakingCampaigns([]);
      setLoadingStakingCampaigns(false);
    };
  }, [library, active, stakerSdk]);

  useEffect(() => {
    async function fetchLmCampaignInfo() {
      const configCampaigns = configWrapper!.getLmCampaigns(
        getProtocolByChainId(chainId!),
        item => item.version === '2.0', // The SDK only works with V2 campaigns, not V1 supported
      );
      const signer = await library.getSigner();

      const cardDataPR = configCampaigns.map(campaign =>
        stakerSdk?.campaignWrapper.getCardData(signer, campaign),
      );

      try {
        setLoadingLmCampaigns(true);
        const cardDataFull = await Promise.all(cardDataPR);
        setLmCampaigns(cardDataFull);
        setLoadingLmCampaigns(false);
      } catch (e) {
        console.error(e);
      }
    }

    if (library && active && stakerSdk) {
      fetchLmCampaignInfo();
    }

    return () => {
      setLmCampaigns([]);
      setLoadingLmCampaigns(false);
    };
  }, [library, active, stakerSdk]);

  const handleStakingWithdraw = async (campaign: StakingInterface): Promise<void> => {
    try {
      setPendingTx(true);
      const tx = await stakerSdk?.soloStakerWrapper.exit(campaign);
      await tx.wait();
      setPendingTx(false);
    } catch (e) {
      setPendingTx(false);
    }
  };

  const handleStakingExit = async (campaign: StakingInterface): Promise<void> => {
    try {
      setPendingTx(true);
      const tx = await stakerSdk?.soloStakerWrapper.completeExit(campaign);
      await tx.wait();
      setPendingTx(false);
    } catch (e) {
      setPendingTx(false);
    }
  };

  const handleStakingStake = async (campaign: StakingInterface): Promise<void> => {
    try {
      setPendingTx(true);
      const tx = await stakerSdk?.soloStakerWrapper.stake(campaign, '1');
      await tx.wait();
      setPendingTx(false);
    } catch (e) {
      console.error(e);
      setPendingTx(false);
    }
  };

  const handleStakingApprove = async (campaign: StakingInterface): Promise<void> => {
    const signer = library.getSigner();

    try {
      setPendingTx(true);
      const tx = await stakerSdk?.soloStakerWrapper.approveToken(signer, campaign);
      await tx.wait();
      setPendingTx(false);
    } catch (e) {
      console.error(e);
      setPendingTx(false);
    }
  };

  const handleLmWithdrawClaim = async (campaignAddress: string): Promise<void> => {
    try {
      setPendingTx(true);
      const tx = await stakerSdk?.campaignWrapper.exit(campaignAddress);
      await tx.wait();
      setPendingTx(false);
    } catch (e) {
      setPendingTx(false);
    }
  };

  const handleLmStake = async (campaignAddress: string): Promise<void> => {
    try {
      setPendingTx(true);
      const tx = await stakerSdk?.campaignWrapper.stake(campaignAddress, '1');
      await tx.wait();
      setPendingTx(false);
    } catch (e) {
      console.error(e);
      setPendingTx(false);
    }
  };

  const handleLmApprove = async (campaign: any): Promise<void> => {
    const signer = library.getSigner();

    try {
      setPendingTx(true);
      const tx = await stakerSdk?.dexWrapper.approveToken(
        signer,
        campaign.campaign.campaignAddress,
        campaign.campaign.liquidityPoolAddress,
      );
      await tx.wait();
      setPendingTx(false);
    } catch (e) {
      console.error(e);
      setPendingTx(false);
    }
  };

  return (
    <div>
      <Head>
        <title>Example StakerSDK</title>
        <meta name="description" content="Generated by create next app" />
      </Head>

      <main>
        <h1>Example SDK integration</h1>
        <div style={{ display: 'flex', justifyContent: 'space-evenly' }}>
          <button disabled={active} onClick={() => activate(injected)}>
            {active ? 'Connected - MetaMask' : 'Activate'}
          </button>
          <p>Connected to: {account || '...'}</p>
        </div>
        <h3>Liquidity Mining Campaigns: </h3>
        {!loadingLmCampaigns ? (
          lmCampaigns.length > 0 ? (
            lmCampaigns.map((campaign, index) => {
              return (
                <article
                  key={index}
                  style={{
                    border: '1px solid black',
                    padding: '20px',
                    margin: '20px',
                    borderRadius: '20px',
                  }}
                >
                  <p>Campaign Address: {campaign.campaign.campaignAddress}</p>
                  <p>Total Staked: {campaign.totalStaked}</p>
                  <p>APY: {campaign.apy.toFixed(2)}</p>
                  <p>LP Tokens: {Number(campaign.LPTokens).toFixed(2)}</p>
                  <ul>
                    {campaign.tuple.map((item: string, index: number) => {
                      return <li key={index}>{item}</li>;
                    })}
                  </ul>

                  <button onClick={() => handleLmApprove(campaign)} disabled={pendingTx}>
                    Approve LP token
                  </button>

                  <button
                    onClick={() => handleLmStake(campaign.campaign.campaignAddress)}
                    disabled={pendingTx}
                  >
                    Stake
                  </button>

                  <button
                    onClick={() => handleLmWithdrawClaim(campaign.campaign.campaignAddress)}
                    disabled={pendingTx}
                  >
                    Withdraw and Claim
                  </button>
                </article>
              );
            })
          ) : (
            <div>No campaigns to show...</div>
          )
        ) : (
          <div>Loading the data for the campaigns...</div>
        )}
        <h3>Staking Campaigns: </h3>
        {!loadingStakingCampaigns ? (
          stakingCampaigns.length > 0 ? (
            stakingCampaigns.map((campaign, index) => {
              return (
                <article
                  key={index}
                  style={{
                    border: '1px solid black',
                    padding: '20px',
                    margin: '20px',
                    borderRadius: '20px',
                  }}
                >
                  <p>Campaign Address: {campaign.campaign.campaignAddress}</p>
                  <p>Total Staked: {campaign.totalStaked}</p>
                  <p>APY: {campaign.apy.toFixed(2)}</p>
                  <p>
                    Balance {campaign.pair.symbol} Tokens:{' '}
                    {Number(campaign.userWalletTokensBalance).toFixed(2)}
                  </p>
                  <ul>
                    <li>{campaign.pair.symbol}</li>
                  </ul>

                  <button
                    onClick={() => handleStakingApprove(campaign.campaign)}
                    disabled={pendingTx}
                  >
                    Approve {campaign.pair.symbol} token
                  </button>

                  <button
                    onClick={() => handleStakingStake(campaign.campaign)}
                    disabled={pendingTx}
                  >
                    Stake
                  </button>

                  <button
                    onClick={() => handleStakingWithdraw(campaign.campaign)}
                    disabled={pendingTx}
                  >
                    Withdraw
                  </button>
                  <button onClick={() => handleStakingExit(campaign.campaign)} disabled={pendingTx}>
                    Exit
                  </button>
                </article>
              );
            })
          ) : (
            <div>No campaigns to show...</div>
          )
        ) : (
          <div>Loading the data for the campaigns...</div>
        )}
      </main>
    </div>
  );
};

export default Home;

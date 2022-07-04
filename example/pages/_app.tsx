import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { Web3ReactProvider } from '@web3-react/core';
import { Web3Provider } from '@ethersproject/providers';
import { StakerSDK, ConfigWrapper } from '@stichting-allianceblock-foundation/lmaas-sdk';
import { useState, createContext, useContext, Dispatch, SetStateAction } from 'react';

const initialContext: {
  stakerSdk: StakerSDK | null;
  configWrapper: ConfigWrapper;
  setStakerSdk: Dispatch<SetStateAction<StakerSDK | null>>;
} = {
  stakerSdk: null,
  configWrapper: new ConfigWrapper('https://api.defiterm-dev.net', 'bonker'),
  setStakerSdk: () => {},
};

const GlobalContext = createContext(initialContext);

initialContext.configWrapper.loadConfig().catch(e => console.error(e));

function MyApp({ Component, pageProps }: AppProps) {
  const [stakerSdk, setStakerSdk] = useState<StakerSDK | null>(initialContext.stakerSdk);
  const [configWrapper] = useState<ConfigWrapper>(initialContext.configWrapper);

  function getLibrary(provider: any): Web3Provider {
    const library = new Web3Provider(provider);
    library.pollingInterval = 12000;
    return library;
  }

  return (
    <Web3ReactProvider getLibrary={getLibrary}>
      <GlobalContext.Provider value={{ stakerSdk, configWrapper, setStakerSdk }}>
        <Component {...pageProps} />
      </GlobalContext.Provider>
    </Web3ReactProvider>
  );
}

export function useGlobalContext(): {
  stakerSdk: StakerSDK | null;
  configWrapper: ConfigWrapper;
  setStakerSdk: Dispatch<SetStateAction<StakerSDK | null>>;
} {
  const globalContext = useContext(GlobalContext);

  return {
    ...globalContext,
  };
}

export default MyApp;

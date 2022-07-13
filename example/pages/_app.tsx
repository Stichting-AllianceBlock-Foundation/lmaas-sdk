import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { Web3ReactProvider } from '@web3-react/core';
import { Web3Provider } from '@ethersproject/providers';
import { StakerSDK, ConfigWrapper } from '@stichting-allianceblock-foundation/lmaas-sdk';
import { useState, createContext, useContext, Dispatch, SetStateAction, useEffect } from 'react';

const initialContext: {
  stakerSdk: StakerSDK | null;
  configWrapper: ConfigWrapper | null;
  setStakerSdk: Dispatch<SetStateAction<StakerSDK | null>>;
  setConfigWrapper: Dispatch<SetStateAction<ConfigWrapper | null>>;
} = {
  stakerSdk: null,
  configWrapper: null,
  setStakerSdk: () => {},
  setConfigWrapper: () => {},
};

const GlobalContext = createContext(initialContext);

function MyApp({ Component, pageProps }: AppProps) {
  const [stakerSdk, setStakerSdk] = useState<StakerSDK | null>(initialContext.stakerSdk);
  const [configWrapper, setConfigWrapper] = useState<ConfigWrapper | null>(
    initialContext.configWrapper,
  );

  useEffect(() => {
    async function fetchConfig() {
      const newConfigWrapper = new ConfigWrapper('https://api.defiterm-dev.net', 'bonker');
      await newConfigWrapper.loadConfig();
      setConfigWrapper(newConfigWrapper);
    }

    fetchConfig();
  }, []);

  function getLibrary(provider: any): Web3Provider {
    const library = new Web3Provider(provider);
    library.pollingInterval = 12000;
    return library;
  }

  return (
    <Web3ReactProvider getLibrary={getLibrary}>
      <GlobalContext.Provider value={{ stakerSdk, configWrapper, setStakerSdk, setConfigWrapper }}>
        <Component {...pageProps} />
      </GlobalContext.Provider>
    </Web3ReactProvider>
  );
}

export function useGlobalContext(): {
  stakerSdk: StakerSDK | null;
  configWrapper: ConfigWrapper | null;
  setStakerSdk: Dispatch<SetStateAction<StakerSDK | null>>;
  setConfigWrapper: Dispatch<SetStateAction<ConfigWrapper | null>>;
} {
  const globalContext = useContext(GlobalContext);

  return {
    ...globalContext,
  };
}

export default MyApp;

import { LMInterface, NetworkEnum, StakingInterface } from '.';

export interface Result {
  [key: string]: any;
}

export interface TokenConfigs {
  [key: string]: Token;
}

export enum TokenConfigsProps {
  ADDRESS = 'address',
  ID = 'id',
  SYMBOL = 'symbol',
  NAME = 'name',
  PROJECT_TOKEN = 'projectToken',
}

export interface Token {
  network: NetworkEnum;
  address: string;
  name: string;
  coinGeckoID: string;
  decimals: number;
  symbol: string;
  projectToken: boolean;
}
export interface Config {
  brandColor: string;
  coinGeckoID: string;
  config: BlockchainConfig;
  contactEmail: string;
  displayName: string;
  logoUrl: string;
  name: string;
  socialMedia: {
    [key: string]: string;
  };
  thirdPartyIntegrations: string;
  theme: 'dark' | 'light' | 'dark_red' | 'dark_blue';
  token: string;
  tokenSymbol: string;
  website: string;
}

export interface BlockchainConfig {
  campaignsLM: LMInterface[];
  campaignsStaking: StakingInterface[];
  tokens: Token[];
}

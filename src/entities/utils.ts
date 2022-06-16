import { NetworkEnum } from '.';

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

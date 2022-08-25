# DeFi Terminal SDK

## Getting started

### Installing

You can either use **npm** or **yarn** to install the package:

```console
$ npm i @allianceblock/lmaas-sdk
```

or

```console
$ yarn add @allianceblock/lmaas-sdk
```

### Creating a new instance

To create a new instance of the SDK, you'll need to provide a `ConfigWrapper` object that downloads the off chain config of the tenant's campaign's you want to interact with.

Each client of the DeFi Terminal has a tenant ID (if you are not sure what your tenant ID is, usually the project's name, always in lowercase. It can be found in their DeFi Terminal's URL (for example https://allianceblock.defiterm.io - here we know it's "allianceblock"). The SDK is meant to be integrated per project, so you'll have to provide the Tenant ID on initialization. We use the "allianceblock" tenant ID for demonstration purposes as it contains a sufficient amount of campaigns to interact with.

You can assume that the API endpoint will always remain the same over time; there is only a difference between development, staging, and production environments, where this endpoint is the production environment.

When you have the `ConfigWrapper` set up, you need to call its `loadConfig` method to actually call the API to get the data.

Ultimately, to get an instance of the SDK, you create a new `StakerSDK` object and pass on the Web3 provider (for example injected by MetaMask), the chainId (1 for ethereum) and the `ConfigWrapper`'s configuration data that can be accessed through the `config.config` property.

```javascript
const configWrapper = new ConfigWrapper('https://api.defiterm.io', 'allianceblock');
await newConfigWrapper.loadConfig();

const sdk = new StakerSDK(provider, chainId, configWrapper.config.config);
```

## Usage

### Retrieving campaigns

When retrieving a list of campaigns, you'll need to reuse the `ConfigWrapper` instance. This is because campaign data is stored off chain and needs to be obtained first before it can be interacted with on chain (through the instance of `StakerSDK`).

#### Liquidity Mining campaigns

```javascript
// get all Liquidity Mining campaigns
const lmCampaigns = configWrapper.getLmCampaigns(stakerSdk.getProtocolByChainId(chainId));

// or a subset of Liquidity Mining campaigns through an optional filter
// here we only show campaigns from the v2.0 campaign contracts
const lmCampaignsFiltered = configWrapper.getLmCampaigns(
  stakerSdk.getProtocolByChainId(chainId),
  item => item.campaign.version === '2.0',
);

// get data that can be used typically inside of a component
// through the getCardData method
// the signer (wallet/account) per campaign needs to be set per campaign
const lmCampaignDataPrep = lmCampaigns.map(campaign =>
  sdk.campaignWrapper.getCardDataCommon(signer, campaign),
);

// resolve promises from all campaigns
const lmCampaignData = await Promise.all(lmCampaignDataPrep);
```

#### Staking campaigns

```javascript
// the code for retrieving staking campaigns is the same
// just use another method to call from the configWrapper:
const stakingCampaigns = configWrapper.getStakingCampaigns(stakerSdk.getProtocolByChainId(chainId));
```

### interacting with the campaigns

#### Approving tokens

```javascript
// liquidity mining
const tx = await sdk.dexWrapper.approveToken(
  signer,
  campaign.campaign.campaignAddress,
  campaign.campaign.liquidityPoolAddress,
);

// staking
const tx = await sdk.soloStakerWrapper.approveToken(signer, campaign);
```

#### Stake

```javascript
// liquidity mining
const tx = await sdk.campaignWrapper.stake(
  signer,
  campaign,
  amountTokens, // the token's decimals will be taken care of by the SDK, but this needs to be a string!
);

// staking
const tx = await sdk.soloStakerWrapper.stake(signer, campaign, amountTokens);
```

### Useful properties of a campaign

```javascript
campaign.campaign.campaignAddress; // the smart contract address of a campaign
campaign.totalStaked; // total staked in the campaign
campaign.apy.toFixed(2); // current APY of the campaign
campaign.userStakedAmount; // how much the connected wallet staked in this campaign
campaign.campaign.version; // the smart contract version of the campaign (either 1.0 or 2.0)
```

> Note: this README will be expanded continiously to contain more information on how to use the SDK properly

Need any support or have any questions? Join our [Discord](https://discord.gg/fB4tkF52H5) at our #development channel!

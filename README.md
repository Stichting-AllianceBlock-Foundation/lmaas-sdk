# Lmaas SDK Typescript

## Getting Started

```bash
# Clone the repository
git clone https://github.com/Stichting-AllianceBlock-Foundation/lmaas-sdk-typescript

# Install dependencies
yarn install
```

## Config

Create config folder with `config.ts` file with the following structure

```javascript
const CONFIG = {
  network: 1,
  APIKey: '<INFURA_API_KEY>',
  privateKey: '<WALLET_PRIVATE_KEY>',
};

export default CONFIG;
```

## VSCode setup

Make sure you have Prettier installed and following rule added in `settings.json`

```json
"editor.codeActionsOnSave": {
  "source.fixAll.eslint": true
}
```

## Generate typings

```bash
npx typechain --target ethers-v5 --out-dir app/contracts './src/abi/*.json'
```

## Run prject

```bash
yarn start
```

Open `index.html` file and open console.

ℹ️ For more info regarding project template and build procedures see here:
https://github.com/metachris/typescript-boilerplate.git

import dotenv from 'dotenv';
import AWS from '@aws-sdk/client-secrets-manager';
import moment from 'moment';
const region = process.env.AWS_REGION || 'us-west-1'
const SecretsManager = new AWS.SecretsManager({ region });

/**
 * Need to add following fields to env:
 * PORT, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 * AWS_SECRETS_MANAGER_ID
 */

dotenv.config();

const config = {
  db: {
    str: 'DB_STRING',
  },
  authBaseUrl: 'AUTH_BASE_URL',
  plaid: {
    basePath: 'PLAID_BASE_PATH',
    clientId: 'PLAID_CLIENT_ID',
    secret: 'PLAID_SECRET',
    useFraudMonitoring: 'PLAID_USE_FRAUD_MONITORING',
    maxFraudScore: 'PLAID_MAX_FRAUD_SCORE',
    sweepAccount: 'PLAID_SWEEP_ACCOUNT',
  },
  socketWebhook: {
    secret: 'SOCKET_WEBHOOK_SECRET',
    url: 'SOCKET_WEBHOOK_URL',
  },
  sendEmailFrom: 'SEND_EMAIL_FROM',
  sendgridApiKey: 'SENDGRID_API_KEY',
  moonpay: {
    secretKey: 'MOONPAY_SECRET_KEY',
    webhookKey: 'MOONPAY_WEBHOOK_KEY',
    publishableKey: 'MOONPAY_PUBLISHABLE_KEY',
    buyUrl: 'MOONPAY_BUY_URL',
    sellUrl: 'MOONPAY_SELL_URL',
  },
  venly: {
    clientId: 'VENLY_CLIENT_ID',
    clientSecret: 'VENLY_CLIENT_SECRET',
    urls: {
      auth: {
        getAccessToken: 'VENLY_AUTH_GET_ACESS_TOKEN_URL',
      },
      wallet: {
        create: 'VENLY_WALLET_CREATE_URL',
      },
    },
    wallet: {
      create: 'VENLY_WALLET_CREATE_URL',
    },
  },
  alchemy: {
    webhook: {
      signingKey: 'ALCHEMY_WEBHOOK_SIGNING_KEY',
    },
  },
  httpRpcUrl: 'HTTP_RPC_URL',
  contracts: {
    Usdc: {
      address: 'USDC_CONTRACT_ADDRESS',
    },
  },
  chain: 'CHAIN',
  chainId: 'CHAIN_ID',
  metaTxService: {
    url: 'META_TX_URL',
    executeEndpoint: 'META_TX_EXECUTE_ENDPOINT',
    authToken: 'META_TX_AUTH_TOKEN',
  },
  stripe: {
    onrampSession: {
      url: 'STRIPE_ONRAMP_SESSION_URL',
    },
    secretKey: 'STRIPE_SECRET_KEY',
    webhookSecret: 'STRIPE_WEBHOOK_SECRET',
    connectAccountId: 'STRIPE_CONNECT_ACCOUNT_ID',
  },
  baseUrl: 'BASE_URL',
  persona: {
    url: 'PERSONA_URL',
    apiKey: 'PERSONA_API_KEY',
  },
  customerIO: {
    siteId: 'CUSTOMER_IO_SITE_ID',
    apiKey: 'CUSTOMER_IO_API_KEY',
    url: 'CUSTOMER_IO_URL',
    appApiKey: 'CUSTOMER_IO_APP_API_KEY',
  },
  mogulApiKey: 'MOGUL_API_KEY',
  apiUrls: {
    marketplace: 'API_MARKETPLACE_URL',
  },
  paymentServiceUrl: 'PAYMENT_SERVICE_URL',
  mogulFee: 'MOGUL_FEE',
  processingFee: 'PROCESSING_FEE',
  crowdSale: {
    minInvestment: 'CROWDSALE_MINIMUM_INVESTMENT',
  },
  mercury: {
    url: 'MERCURY_BASE_URL',
  },
  crypto: {
    key: 'CRYPTO_KEY',
    encryptionIV: 'CRYPTO_ENCRYPTION_IV',
  },
  brex: {
    url: 'BREX_BASE_URL',
    sweepAccountToken: 'BREX_SWEEP_ACCOUNT_TOKEN',
    sweepAccountId: 'BREX_SWEEP_ACCOUNT_ID',
    revenueSubAccountId: 'BREX_REVENUE_SUB_ACCOUNT_ID',
    rentAccountId: 'BREX_RENT_SWEEP_ACCOUNT',
  },
  fireblocks: {
    apiKey: 'FIREBLOCKS_API_KEY',
    adminVaultAccountId: 'FIREBLOCKS_ADMIN_VAULT_ACCOUNT_ID',
    chainId: 'FIREBLOCKS_CHAIN_ID'
  },
};

let staleAfter = moment.utc();
const cachedConfig = {};
const updateObjProps = (obj, newObj, secretValues) => {
  for (const key in newObj) {
    if (newObj[key]?.constructor?.name === {}.constructor.name) {
      obj[key] = obj[key] ?? {};
      updateObjProps(obj[key], newObj[key], secretValues);
      continue;
    }
    obj[key] = secretValues[newObj[key]] || process.env[newObj[key]];
  }
};

const proxyConfig = new Proxy(config, {
  async get(target, prop, _originalObj) {
    try {
      if (staleAfter.unix() > moment.utc().unix()) return cachedConfig[prop];
      let values = {};
      if (process.env.AWS_SECRETS_MANAGER_ID) {
        const result = await SecretsManager.getSecretValue({
          SecretId: process.env.AWS_SECRETS_MANAGER_ID,
        });
        values = JSON.parse(result.SecretString);
      } else {
        values = {
          DB_STRING: process.env.DB_STRING,
          AUTH_BASE_URL: process.env.AUTH_BASE_URL,
          PLAID_BASE_PATH: process.env.PLAID_BASE_PATH,
          PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID,
          PLAID_SECRET: process.env.PLAID_SECRET,
          PLAID_USE_FRAUD_MONITORING: process.env.PLAID_USE_FRAUD_MONITORING,
          PLAID_MAX_FRAUD_SCORE: process.env.PLAID_MAX_FRAUD_SCORE,
          PLAID_SWEEP_ACCOUNT: process.env.PLAID_SWEEP_ACCOUNT,
          SOCKET_WEBHOOK_SECRET: process.env.SOCKET_WEBHOOK_SECRET,
          SOCKET_WEBHOOK_URL: process.env.SOCKET_WEBHOOK_URL,
          SEND_EMAIL_FROM: process.env.SEND_EMAIL_FROM,
          SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
          MOONPAY_SECRET_KEY: process.env.MOONPAY_SECRET_KEY,
          MOONPAY_WEBHOOK_KEY: process.env.MOONPAY_WEBHOOK_KEY,
          MOONPAY_PUBLISHABLE_KEY: process.env.MOONPAY_PUBLISHABLE_KEY,
          MOONPAY_BUY_URL: process.env.MOONPAY_BUY_URL,
          MOONPAY_SELL_URL: process.env.MOONPAY_SELL_URL,
          VENLY_CLIENT_ID: process.env.VENLY_CLIENT_ID,
          VENLY_CLIENT_SECRET: process.env.VENLY_CLIENT_SECRET,
          VENLY_AUTH_GET_ACESS_TOKEN_URL: process.env.VENLY_AUTH_GET_ACESS_TOKEN_URL,
          VENLY_WALLET_CREATE_URL: process.env.VENLY_WALLET_CREATE_URL,
          HTTP_RPC_URL: process.env.HTTP_RPC_URL,
          USDC_CONTRACT_ADDRESS: process.env.USDC_CONTRACT_ADDRESS,
          CHAIN: process.env.CHAIN,
          CHAIN_ID: process.env.CHAIN_ID,
          META_TX_URL: process.env.META_TX_URL,
          META_TX_EXECUTE_ENDPOINT: process.env.META_TX_EXECUTE_ENDPOINT,
          META_TX_AUTH_TOKEN: process.env.META_TX_AUTH_TOKEN,
          STRIPE_ONRAMP_SESSION_URL: process.env.STRIPE_ONRAMP_SESSION_URL,
          STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
          STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
          STRIPE_CONNECT_ACCOUNT_ID: process.env.STRIPE_CONNECT_ACCOUNT_ID,

          BASE_URL: process.env.BASE_URL,
          CUSTOMER_IO_SITE_ID: process.env.CUSTOMER_IO_SITE_ID,
          CUSTOMER_IO_API_KEY: process.env.CUSTOMER_IO_API_KEY,
          CUSTOMER_IO_URL: process.env.CUSTOMER_IO_URL,
          CUSTOMER_IO_APP_API_KEY: process.env.CUSTOMER_IO_APP_API_KEY,
          MOGUL_API_KEY: process.env.MOGUL_API_KEY,
          API_MARKETPLACE_URL: process.env.API_MARKETPLACE_URL,
          PAYMENT_SERVICE_URL: process.env.PAYMENT_SERVICE_URL,
          MOGUL_FEE: process.env.MOGUL_FEE,
          PROCESSING_FEE: process.env.PROCESSING_FEE,
          CROWDSALE_MINIMUM_INVESTMENT: process.env.CROWDSALE_MINIMUM_INVESTMENT,
          MERCURY_BASE_URL: process.env.MERCURY_BASE_URL,
          CRYPTO_KEY: process.env.CRYPTO_KEY,
          CRYPTO_ENCRYPTION_IV: process.env.CRYPTO_ENCRYPTION_IV,
          BREX_BASE_URL: process.env.BREX_BASE_URL,
          BREX_SWEEP_ACCOUNT_TOKEN: process.env.BREX_SWEEP_ACCOUNT_TOKEN,
          BREX_SWEEP_ACCOUNT_ID: process.env.BREX_SWEEP_ACCOUNT_ID,
          BREX_REVENUE_SUB_ACCOUNT_ID: process.env.BREX_REVENUE_SUB_ACCOUNT_ID,
          BREX_RENT_SWEEP_ACCOUNT: process.env.BREX_RENT_SWEEP_ACCOUNT,
          FIREBLOCKS_API_KEY: process.env.FIREBLOCKS_API_KEY,
          FIREBLOCKS_ADMIN_VAULT_ACCOUNT_ID: process.env.FIREBLOCKS_ADMIN_VAULT_ACCOUNT_ID,
          FIREBLOCKS_CHAIN_ID: process.env.FIREBLOCKS_CHAIN_ID
        };
      }
      updateObjProps(cachedConfig, target, values);
      staleAfter = moment.utc().add(60, 'seconds');

      return cachedConfig[prop];
    } catch (err) {
      throw err;
    }
  },
});

export default proxyConfig;

import crypto from 'crypto';
import axios from 'axios';
import config from '../../config/config.js';
import VenlyHelperClass from '../../helpers/venly.helper.js';
const VenlyHelper = new VenlyHelperClass();

export const createWidgetURL = async (user, request) => {
  try {
    /* Check for user deposit limits */
    // const balance = await fetchUSDCBalance(user.blockchainAddress);

    /* Setup URL */
    let originalUrl;
    if (request?.widget === 'Sell') {
      originalUrl = `${(await config.moonpay).sellUrl}?apiKey=${(await config.moonpay).publishableKey}&baseCurrencyCode=USDC_POLYGON`;
      user.email = encodeURIComponent(user.email);
      user.blockchainAddress = encodeURIComponent(user?.blockchainAddress);
      originalUrl = originalUrl + `&email=${user.email}` + `&refundWalletAddress=${user.blockchainAddress}` + `&externalCustomerId=${user._id}` + `&showWalletAddressForm=true`;
    } else {
      originalUrl = `${(await config.moonpay).buyUrl}?apiKey=${(await config.moonpay).publishableKey}&currencyCode=USDC_POLYGON`;
      user.email = encodeURIComponent(user.email);
      user.blockchainAddress = encodeURIComponent(user?.blockchainAddress);
      const redirectUrl = encodeURIComponent(`${await config.baseUrl}/wallet?page=transactions`);
      let paymentMethod;
      if (request?.paymentMethod) {
        paymentMethod = request.paymentMethod;
      } else {
        paymentMethod = 'credit_debit_card';
      }
      originalUrl =
        originalUrl +
        `&email=${user.email}` +
        `&walletAddress=${user.blockchainAddress}` +
        `&externalCustomerId=${user._id}` +
        `&redirectURL=${redirectUrl}` +
        `&paymentMethod=${paymentMethod}`;

      if (request?.directInvest === 'true') {
        originalUrl = originalUrl + `&quoteCurrencyAmount=${request?.baseAmount}` + `&lockAmount=false`;
      }
    }
    const signature = crypto
      .createHmac('sha256', (await config.moonpay).secretKey)
      .update(new URL(originalUrl).search)
      .digest('base64');
    const urlWithSignature = `${originalUrl}&signature=${encodeURIComponent(signature)}`;
    return urlWithSignature;
  } catch (err) {
    return { error: err.message };
  }
};

export const fetchUSDCBalance = async (walletAddress) => {
  let erc20 = 0;
  let balance = await VenlyHelper.getWalletBalance(walletAddress);
  const usdcAddress = (await config.contracts).Usdc.address;
  if (balance?.hasError) return { error: balance.error };
  if (balance?.value?.length === 0) erc20 = 0;
  else {
    balance.value.forEach(async (el) => {
      if (el.symbol === 'USDC' && el.tokenAddress.toLowerCase() === usdcAddress.toLowerCase()) {
        erc20 += el.balance;
      }
    });
  }
  return erc20;
};

export const createSardineWidgetURL = async (user) => {
  try {
    /* Bearer Token */
    const bearer = Buffer.from(`${(await config.sardine).clientId}:${(await config.sardine).clientSecret}`).toString('base64');

    /* Fetch client token */
    const options = {
      method: 'POST',
      url: (await config.sardine).clientTokenUrl,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${bearer}`,
      },
    };
    const { data } = await axios.request(options);
    let originalUrl = `${(await config.sardine).baseUrl}?address=${user.blockchainAddress}&fiat_currency=USD&fixed_fiat_currency=USD&fixed_asset_type=USDC&network=polygon`;
    originalUrl = originalUrl + `&client_token=${data.clientToken}`;
    return originalUrl;
  } catch (err) {
    return { error: err.message };
  }
};

export const createTransakURL = async (user, query) => {
  try {
    let originalUrl;
    if (query?.type === 'Sell') {
    } else {
      let paymentMethod;
      originalUrl = `${(await config.transak).url.buy}?apiKey=${(await config.transak).apiKey}`;
      if (query?.paymentMethod) {
        paymentMethod = query.paymentMethod;
      } else {
        paymentMethod = 'credit_debit_card';
      }

      let firstName = '';
      let lastName = '';
      if (user.userType === 'admin') {
        firstName = user.name;
        lastName = 'Admin';
      } else {
        firstName = user?.firstName;
        lastName = user?.lastName;
      }
      originalUrl =
        originalUrl +
        `&fiatCurrency=USD&countryCode=US` +
        `&defaultPaymentMethod=${paymentMethod}` +
        `&walletAddress=${user.blockchainAddress}&network=polygon` +
        `&cryptoCurrencyCode=FUSDC&network=polygon` +
        `&disableWalletAddressForm=true` +
        `&email=${user.email}` +
        `&partnerCustomerId=${user._id}` +
        `&firstName=${firstName}&lastName=${lastName}` +
        `&mobileNumber=${user.countryCode}${user.mobileNumber}`;

      return originalUrl;
    }
  } catch (err) {
    return { error: err.message };
  }
};

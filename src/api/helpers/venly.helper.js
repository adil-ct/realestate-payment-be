import qs from 'qs';
import axios from 'axios';
import moment from 'moment';
import config from '../config/config.js';
import logger from '../config/logger.js';

export default class VenlyHelper {
  #accessToken;
  #expiresAt;

  constructor() {
    this.#accessToken = null;
    this.#expiresAt = moment.utc();
  }

  #expiresIn() {
    return this.#expiresAt.unix() - moment.utc().unix();
  }

  async #authenticate() {
    try {
      const data = qs.stringify({
        grant_type: 'client_credentials',
        client_id: (await config.venly).clientId,
        client_secret: (await config.venly).clientSecret,
      });
      const reqConfig = {
        method: 'post',
        url: (await config.venly).urls.auth.getAccessToken,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data,
      };

      const { data: response } = await axios(reqConfig);
      const { access_token, expires_in } = response;
      this.#accessToken = access_token;
      this.#expiresAt = moment.utc().add(expires_in, 'seconds');

      return { hasError: false };
    } catch (error) {
      logger.error(error);
      return {
        hasError: true,
        error: error?.response?.data?.error_description ?? error.message,
      };
    }
  }

  async getWalletBalance(walletAddress) {
    try {
      if (this.#expiresIn() < 30) {
        const { hasError, error } = await this.#authenticate();
        if (hasError) return { hasError, error };
      }
      const secretType = 'MATIC'; // MATIC // ETHEREUM
      const reqConfig = {
        method: 'get',
        url: `${(await config.venly).urls.wallet.create}/${secretType}/${walletAddress}/balance/tokens`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.#accessToken}`,
        },
      };
      const { data } = await axios(reqConfig);
      return { hasError: false, value: data.result };
    } catch (err) {
      logger.error(err);
      return {
        hasError: true,
        error: err?.response?.data?.errors?.[0]?.message ?? err.message,
      };
    }
  }

  async exportVenlyWallet(venly, password) {
    try {
      if (this.#expiresIn() < 30) {
        const { hasError, error } = await this.#authenticate();
        if (hasError) return { hasError, error };
      }
      const reqConfig = {
        method: 'post',
        url: `${(await config.venly).urls.wallet.create}/${venly.walletId}/export`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.#accessToken}`,
        },
        data: {
          pincode: venly.pincode,
          password,
        },
      };
      const { data } = await axios(reqConfig);
      return { hasError: false, value: data.result };
    } catch (err) {
      logger.error(err);
      return {
        hasError: true,
        error: err?.response?.data?.errors?.[0]?.message ?? err.message,
      };
    }
  }
}

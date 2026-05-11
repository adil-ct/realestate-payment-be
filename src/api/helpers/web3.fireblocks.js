import fs from 'fs'
import path from 'path'
import config from '../config/config.js';
import logger from '../config/logger.js';
import { FireblocksWeb3Provider, ChainId, ApiBaseUrl } from '@fireblocks/fireblocks-web3-provider';
import { secretKey } from '../config/fireblocks.config.js';
import Web3 from 'web3';
import UsdcAbi from '../../abis/usdc.json' with { type: 'json' };

// @todo uncomment once client creds provided 928437
// const eip1193Provider = new FireblocksWeb3Provider({
//   apiBaseUrl: ApiBaseUrl.Production,
//   privateKey: secretKey,
//   apiKey: (await config.fireblocks).apiKey,
//   vaultAccountIds: [(await config.fireblocks).adminVaultAccountId],
//   chainId: process.env.NODE_ENV === 'production' ? ChainId['AVALANCHE'] : ChainId['AVALANCHE_TEST'],
// });

// const secretKey = fs.readFileSync(path.resolve("fireblocks_secret.key"), "utf8")

const eip1193Provider = new FireblocksWeb3Provider({
  apiBaseUrl: ApiBaseUrl.Sandbox,
  privateKey: secretKey,
  apiKey: (await config.fireblocks).apiKey,
  vaultAccountIds: [(await config.fireblocks).adminVaultAccountId],
  // chainId: process.env.NODE_ENV === 'production' ? ChainId['AVALANCHE'] : ChainId['AVALANCHE_TEST'],
  chainId: (await config.fireblocks).chainId ?? '80002'
});

class Web3Helper {
  web3 = new Web3();
  initializationPromise = null;

  contracts = {
    Usdc: 'Usdc',
  };

  Usdc = null;
  CHAIN_ID = null;

  constructor() {
    const promises = [];
    let promise;
    promise = config.chainId.then((chainId) => (this.CHAIN_ID = chainId));
    promises.push(promise);
    this.web3 = new Web3(eip1193Provider);

    promise = config.contracts.then((contracts) => {
      this.Usdc = new this.web3.eth.Contract(UsdcAbi, contracts.Usdc.address);
    });

    promises.push(promise);
    this.initializationPromise = Promise.all(promises);
  }

  async ExecuteMethod(methodType, contract, funcName, params = []) {
    switch (methodType) {
      case 'CALL':
        return await this.Call(contract, funcName, params);

      case 'SEND':
        return await this.Send(contract, funcName, params);

      default:
        return null;
    }
  }

  async Call(contract, funcName, params) {
    try {
      const result = await this[contract].methods[funcName](...params).call();
      return result;
    } catch (error) {
      logger.error(error);
      return { error: true, message: error.message };
    }
  }

  async Send(contract, funcName, params = []) {
    try {
      let result;
      const myAddr = await this.web3.eth.getAccounts();
      result = await this[contract].methods[funcName](...params).send({
        from: myAddr[0],
      });
      return result;
    } catch (error) {
      logger.error(`${contract}: ${funcName}`);
      logger.error(error?.response?.data?.error?.message ?? error);
      return {
        error: true,
        message: error?.response?.data?.error?.message ?? error?.message,
      };
    }
  }

  strToUSDCConvert(str) {
    str = str.toString();
    let [beforeDecimalVal, afterDecimalVal] = str.split('.');
    if (!afterDecimalVal) afterDecimalVal = '';
    afterDecimalVal = afterDecimalVal.padEnd(6, '0');
    const result = this.web3.utils.toBN(beforeDecimalVal.concat(afterDecimalVal));
    return result;
  }

  async validateAddress(address) {
    const result = await this.web3.utils.isAddress(address);
    return result;
  }

  async decryptKeyStore(keystore, password) {
    const decrypt = await this.web3.eth.accounts.decrypt(keystore, password);
    return decrypt;
  }
}

export default new Web3Helper();

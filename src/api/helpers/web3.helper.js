import Web3 from 'web3';
import axios from 'axios';
import abi from 'ethereumjs-abi';
import { toBuffer } from 'ethereumjs-util';
import config from '../config/config.js';
import logger from '../config/logger.js';
import UsdcAbi from '../../abis/usdc.json' assert { type: 'json' };
class Web3Helper {
  nonMetaFunctions = {
    Usdc: [],
  };

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
    promise = config.httpRpcUrl.then((rpc) => {
      this.web3 = new Web3(rpc);
      config.contracts.then((contracts) => {
        this.Usdc = new this.web3.eth.Contract(UsdcAbi, contracts.Usdc.address);
      });
    });
    promises.push(promise);
    this.initializationPromise = Promise.all(promises);
  }

  async ExecuteMethod(proceedAs = { walletId: null, address: null, pincode: null }, methodType, contract, funcName, params = []) {
    switch (methodType) {
      case 'CALL':
        return await this.Call(contract, funcName, params);

      case 'SEND':
        return await this.Send(proceedAs, contract, funcName, params);

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

  async Send(proceedAs, contract, funcName, params = []) {
    try {
      let result;
      if (!this.nonMetaFunctions?.[contract].includes(funcName)) {
        const func = this[contract].methods[funcName](...params);
        // Call estimateGas method on non-meta function call to check if this
        // transaction will execute successfully or not. If not then it will
        // fall into catch block and return the respective error.
        await func.estimateGas({ from: proceedAs.address });
        const functionSignature = func.encodeABI();
        const { url, executeEndpoint, authToken } = await config.metaTxService;
        logger.info(`${contract}: ${funcName} => Calling execute meta-tx api.`);
        const { data } = await axios.post(
          url + executeEndpoint,
          {
            proceedAs,
            functionSignature,
            contractName: contract,
            chain: await config.chain,
          },
          { headers: { 'x-auth-token': authToken } }
        );

        result = data?.data?.items?.[0];
      } else {
        // TODO
        throw new Error('Venly integration for executing functions as non-meta tx is unimplemented.');
      }
      return result;
    } catch (error) {
      logger.error(`${contract}: ${funcName}`);
      logger.error(error?.response?.data?.error?.message ?? error.message);
      return {
        error: true,
        message: error?.response?.data?.error?.message ?? error?.message,
      };
    }
  }

  GetSignatureParameters(signature) {
    if (!this.web3.utils.isHexStrict(signature)) {
      return {
        error: 'Given value "'.concat(signature, '" is not a valid hex string.'),
      };
    }
    const r = signature.slice(0, 66);
    const s = '0x'.concat(signature.slice(66, 130));
    const _v = '0x'.concat(signature.slice(130, 132));
    let v = this.web3.utils.hexToNumber(_v);
    if (![27, 28].includes(v)) v += 27;
    return {
      r,
      s,
      v,
    };
  }

  ConstructMetaTransactionMessage(nonce, chainId, functionSignature, contractAddress) {
    return abi.soliditySHA3(['uint256', 'address', 'uint256', 'bytes'], [nonce, contractAddress, chainId, toBuffer(functionSignature)]);
  }

  strToERC20(str) {
    // Convert input value to string just in case it was passed as some other
    // type that can be converted into string.
    str = str.toString();
    let [beforeDecimalVal, afterDecimalVal] = str.split('.');
    if (!afterDecimalVal) afterDecimalVal = '';
    afterDecimalVal = afterDecimalVal.padEnd(18, '0');
    const result = this.web3.utils.toBN(beforeDecimalVal.concat(afterDecimalVal));
    return result;
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

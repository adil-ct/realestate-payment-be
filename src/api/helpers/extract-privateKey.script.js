import crypto from 'crypto';
import config from '../config/config.js';
import User from '../components/payment/userModel.js';
import VenlyHelperClass from './venly.helper.js';
import { decryptKey } from '../components/payment/service.js';
const VenlyHelper = new VenlyHelperClass();

const baseEncoding = 'base64';
const algorithm = 'aes-256-cbc';
const cryptoKey = (await config.crypto).key;
const cryptoIV = (await config.crypto).encryptionIV;

const encrypt = (target) => {
  console.info('Inside encrytpion helper');
  const inputEncoding = 'utf8';
  const outputEncoding = 'hex';
  const cipher = crypto.createCipheriv(algorithm, cryptoKey, cryptoIV);
  const encryptedString = Buffer.from(cipher.update(target, inputEncoding, outputEncoding) + cipher.final(outputEncoding)).toString(baseEncoding);
  return encryptedString;
};

const extractPrivateKey = async (user) => {
  try {
    console.info(`Extracting Private Key of ${user.email}`);
    const password = 'mogulXvenly@prod';
    const keyStore = await VenlyHelper.exportVenlyWallet(user.venly, password);
    if (keyStore?.error) return keyStore.error;
    const privateKey = await decryptKey(keyStore.value.keystore, password);
    const encryptedKey = await encrypt(privateKey.privateKey);
    await User.updateOne({ _id: user._id }, { privateKey: encryptedKey });
    return;
  } catch (err) {
    console.log(err.message);
  }
};

export const fetchUsersForPrivateKey = async () => {
  try {
    console.info('Fetch Users');
    if (process.env.NODE_ENV !== 'production') return;
    let promises = [];
    for await (let user of User.find({ privateKey: undefined, blockchainAddress: { $ne: undefined } })
      .skip(0)
      .limit(100)) {
      if (!user.blockchainAddress || !user.venly) continue;
      promises.push(extractPrivateKey(user));
    }
    await Promise.allSettled(promises).then(() => console.log('All resolved...'));
  } catch (err) {
    console.log(err.message);
  }
};

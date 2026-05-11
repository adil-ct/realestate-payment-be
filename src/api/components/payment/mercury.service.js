import crypto from 'crypto';
import axios from 'axios';
import logger from '../../config/logger.js';
import config from '../../config/config.js';
import { generateuuid } from '../../helpers/helpers.js';
import Payment from './model.js';
import RentBalance from './rentBalance.model.js';
import mongoose from 'mongoose';
import db from '../../connections/dbMaster.js';
const ObjectId = mongoose.Types.ObjectId;
const PropertyModel = db.collection('property');

// To encrypt mercury token
const encryptMercuryToken = async (token) => {
  const cipher = crypto.createCipheriv('aes-256-cbc', (await config.crypto).key, (await config.crypto).encryptionIV);
  const encryptedToken = Buffer.from(cipher.update(token, 'utf8', 'hex') + cipher.final('hex')).toString('base64');
  return encryptedToken;
};

const decryptMercuryToken = async (token) => {
  try {
    logger.info('Inside decrypt mercury token service');
    if (!token) return { error: 'Invalid token' };
    const buff = Buffer.from(token, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', (await config.crypto).key, (await config.crypto).encryptionIV);
    const decryptedToken = decipher.update(buff.toString('utf8'), 'hex', 'utf8') + decipher.final('utf8');
    return decryptedToken;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const mercuryGetRequest = async (path, token) => {
  try {
    token = await decryptMercuryToken(token);
    const url = (await config.mercury).url + path;
    logger.info('Fetching from API ' + url);
    const options = {
      method: 'GET',
      url,
      headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
    };
    const response = await axios.request(options);
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err.response.data ?? err.message };
  }
};

export const mercuryPostRequest = async (path, request, token) => {
  try {
    token = await decryptMercuryToken(token);
    const url = (await config.mercury).url + path;
    logger.info('Fetching from API ' + url);
    const options = {
      method: 'POST',
      url,
      headers: { accept: 'application/json', 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      data: request,
    };
    const response = await axios.request(options);
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.errors?.message ?? err.message };
  }
};

export const mercuryBatchTransfers = async (transfers, propertyId) => {
  try {
    logger.info('inside mercury batch transfers service');

    // get property and set mercury and brex variables
    const property = await PropertyModel.findOne({ _id: ObjectId(propertyId) });
    const mercuryToken = property.financials.mercuryToken;
    const mercuryRentAccountUuid = property.financials.mercuryRentAccountUuid;
    const brexRentAccountRecipientId = property.financials.brexRentAccountRecipientId;

    // accumulate total to transfer
    const totalToTransfer = transfers.reduce((acc, transfer) => acc + transfer.rentCredits, 0);

    // create recipient batch request
    const idempotencyKey = await generateuuid();
    const request = {
      recipientId: brexRentAccountRecipientId,
      amount: totalToTransfer,
      paymentMethod: 'ach',
      idempotencyKey,
      note: `batch transfer ${transfers.length} payments`,
    };

    const transfer = await mercuryPostRequest(`account/${mercuryRentAccountUuid}/transactions`, request, mercuryToken);

    // if there is an error, update all payments as failed
    if (transfer?.error) {
      for (let data of transfers) {
        await Payment.updateOne(
          { _id: data.paymentId },
          {
            $push: {
              withdrawnRentCredits: {
                rentBalanceId: data.rentBalanceId,
                propertyId: data.propertyId,
                rentCredits: data.rentCredits,
                status: 'failed',
                failureReason: transfer?.response?.data?.errors?.message ?? transfer.error,
              },
            },
          }
        );
      }

      return { hasError: true, id: propertyId };
    }

    // if mercury transfer request went through and is now pending
    if (transfer.status === 'pending') {
      // update all payments
      for (let data of transfers) {
        await Payment.updateOne(
          { _id: data.paymentId },
          {
            $push: {
              withdrawnRentCredits: {
                rentBalanceId: data.rentBalanceId,
                propertyId: data.propertyId,
                rentCredits: transfer?.amount ?? data.rentCredits,
                transferId: transfer?.id,
                status: 'processing',
              },
            },
          }
        );
        const rentBalance = await RentBalance.findOne({ _id: data.rentBalanceId });
        rentBalance.rentCredits = parseFloat((rentBalance.rentCredits - data.rentCredits).toFixed(2));
        rentBalance.rentCreditsOnHold = parseFloat((rentBalance.rentCreditsOnHold + data.rentCredits).toFixed(2));
        await rentBalance.save();
      }
    }

    return { hasError: false };
  } catch (e) {
    logger.error(err.message);
    return { error: err?.response?.data?.errors?.message ?? err.message };
  }
};

import axios from 'axios';
import logger from '../../config/logger.js';
import config from '../../config/config.js';
import { generateuuid } from '../../helpers/helpers.js';

export const brexPostRequest = async (path, request) => {
  try {
    logger.info('Inside brex post request service');
    const token = (await config.brex).sweepAccountToken;
    const url = (await config.brex).url + path;
    logger.info('Fetching from API ' + url);
    const options = {
      method: 'POST',
      url,
      headers: { 'content-type': 'application/json', 'Idempotency-Key': await generateuuid(), Authorization: `Bearer ${token}` },
      data: request,
    };
    const response = await axios.request(options);
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err.response.data.message ?? err.message };
  }
};

export const brexGetRequest = async (url) => {
  try {
    logger.info('Inside brex get request service');
    const token = (await config.brex).sweepAccountToken;
    logger.info('Fetching from API ' + url);
    const options = {
      method: 'GET',
      url,
      headers: { 'content-type': 'application/json', 'Idempotency-Key': await generateuuid(), Authorization: `Bearer ${token}` },
    };
    const response = await axios.request(options);
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const brexTransfer = async (payment, property) => {
  try {
    logger.info('Inside brex transfer service');
    let amountToLLC = parseFloat((parseFloat(payment.amount.amount) - parseFloat(payment.fees.amount ?? 0) - parseFloat(payment.rewards ?? 0)).toFixed(2));
    const transferReq = {
      counterparty: {
        type: 'VENDOR',
        payment_instrument_id: property.financials.brexPaymentInstrumentId, // Store in property Doc from admin side
      },
      amount: {
        amount: amountToLLC * 100, // It takes amount in cent
        currency: 'USD',
      },
      description: `Transfer against payment Id: ${payment._id}`, // We can use it internally
      external_memo: `Crowdsale Funding for property ${property.otherInfo.title}`, // This will be shown in statement
      originating_account: {
        type: 'BREX_CASH',
        id: (await config.brex).sweepAccountId,
      },
    };
    const transferRes = await brexPostRequest('transfers', transferReq);
    return transferRes;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const brexWebhookSubscribe = async (webhookURL) => {
  try {
    logger.info('Inside brex webhook subscribe service');
    const webhook = await brexPostRequest(
      'webhooks',
      JSON.stringify({
        url: webhookURL,
        event_types: ['TRANSFER_PROCESSED', 'TRANSFER_FAILED'],
      })
    );
    return webhook;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const transferFeeToBrexRevenueAccount = async (fees, paymentId, description) => {
  try {
    logger.info('Inside transfer fee to brex revenue account service');
    // Check for sweep account balance
    const accountId = (await config.brex).sweepAccountId;
    const accountDetails = await brexGetRequest(`https://platform.brexapis.com/v2/accounts/cash/${accountId}`);
    if (accountDetails?.error) return { error: accountDetails.error };
    const balance = accountDetails.available_balance.amount / 100;
    if (balance < fees) return { error: 'Insufficient balance to transfer fee' };

    // Transfer Request
    const transferReq = {
      counterparty: {
        type: 'BOOK_TRANSFER',
        recipient: {
          type: 'ACCOUNT_ID',
          id: (await config.brex).revenueSubAccountId,
        },
      },
      amount: {
        amount: parseFloat(fees) * 100, // It takes amount in cent
        currency: 'USD',
      },
      description: `Processing fee against payment Id: ${paymentId}`, // We can use it internally
      external_memo: description, // This will be shown in statement
      originating_account: {
        type: 'BREX_CASH',
        id: (await config.brex).sweepAccountId,
      },
    };
    const transferRes = await brexPostRequest('transfers', transferReq);
    return transferRes;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const brexWithdrawTransfers = async (amount, description, receivingAccountId, originatingAccountId) => {
  try {
    logger.info('Inside transfer fee to brex revenue account service');
    // Check for available balance
    const accountId = originatingAccountId;
    const accountDetails = await brexGetRequest(`https://platform.brexapis.com/v2/accounts/cash/${accountId}`);
    if (accountDetails?.error) return { error: accountDetails.error };
    const balance = accountDetails.available_balance.amount / 100;
    if (balance < amount) return { error: 'Insufficient balance to transfer fee' };

    // Transfer
    const transferReq = {
      counterparty: {
        type: 'BOOK_TRANSFER',
        recipient: {
          type: 'ACCOUNT_ID',
          id: receivingAccountId,
        },
      },
      amount: {
        amount: parseFloat(amount) * 100, // It takes amount in cent
        currency: 'USD',
      },
      description: description,
      external_memo: description,
      originating_account: {
        type: 'BREX_CASH',
        id: originatingAccountId,
      },
    };
    const transferRes = await brexPostRequest('transfers', transferReq);
    return transferRes;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const transferWithdrawFundsToUser = async (payment) => {
  try {
    logger.info('Inside transfer wihdraw funds to user servie');
    const feeAmount = parseFloat(payment.fees.amount);
    const amountToUser = parseFloat((payment.withdrawRequestedIRCreditsSettled + payment.withdrawRequestedRentCreditsSettled - feeAmount).toFixed(2));
    // Transfer Fee to Brex revenue sub-account
    const feeTransferReq = {
      counterparty: {
        type: 'BOOK_TRANSFER',
        recipient: {
          type: 'ACCOUNT_ID',
          id: (await config.brex).revenueSubAccountId,
        },
      },
      amount: {
        amount: parseFloat(feeAmount) * 100,
        currency: 'USD',
      },
      description: `Processing Fee against withdrawal ${payment._id}`,
      external_memo: `Processing Fee against withdrawal ${payment._id}`,
      originating_account: {
        type: 'BREX_CASH',
        id: (await config.brex).rentAccountId,
      },
    };
    const feeTransferRes = await brexPostRequest('transfers', feeTransferReq);
    if (feeTransferRes?.error) {
      payment.feeTransferStatus = 'failed';
      payment.feeTransferFailureReason = feeTransferRes.error;
    } else {
      payment.feeTransferId = feeTransferRes?.id;
    }
    await payment.save();

    // Transfer to User
    const transferReq = {
      counterparty: {
        type: 'VENDOR',
        payment_instrument_id: payment.brexPaymentInstrumentId,
      },
      amount: {
        amount: parseFloat(amountToUser) * 100,
        currency: 'USD',
      },
      description: `Credits withdrawal ${payment._id}`,
      external_memo: `Credits withdrawal ${payment._id}`,
      originating_account: {
        type: 'BREX_CASH',
        id: (await config.brex).rentAccountId,
      },
    };
    const transferRes = await brexPostRequest('transfers', transferReq);
    if (transferRes?.error) {
      payment.status = 'failed';
      payment.failureReason = transferRes.error;
    } else {
      payment.status = 'completed';
      payment.id = transferRes?.id;
    }
    await payment.save();
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

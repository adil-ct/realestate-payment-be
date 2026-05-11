import axios from 'axios';
import db from '../connections/dbMaster.js';
import logger from '../config/logger.js';
import config from '../config/config.js';
import User from '../components/payment/userModel.js';
import Payment from '../components/payment/model.js';
import Transfer from '../components/payment/transfers.model.js';
import { catchPlaidEvent } from '../components/webhook/moonpay.service.js';
import { reportReturnToPlaidSignal } from '../helpers/plaid.js';
import { plaidRequest } from '../components/payment/plaid.service.js';
import { unblockTokensAndCredits, makeInvestment, addCreditsToReferralUser, updateReferralDocForAffiliate } from '../components/payment/stripe.service.js';
import { brexTransfer, transferFeeToBrexRevenueAccount } from '../components/payment/brex.service.js';
import { auth_sendEmail } from './auth.js';
import constants from '../config/constants.js';
import { generateuuid } from './helpers.js';
import { mercuryBatchTransfers, mercuryGetRequest } from '../components/payment/mercury.service.js';
import { withdrawalFailedStatusCheck, withdrawalStatusCheckAndFundTransfer } from '../components/payment/service.js';
import RentBalance from '../components/payment/rentBalance.model.js';
const Property = db.collection('property');
const Referral = db.collection('referral');
const plaid = {
  client_id: (await config.plaid).clientId,
  secret: (await config.plaid).secret,
};

export const processFailedInvestments = async () => {
  try {
    logger.info('Inside process failed investments cron service');
    for await (const payment of Payment.find({ status: 'succeeded', investmentStatus: 'failed' })) {
      if (parseFloat(payment.amount.amount) <= 0) continue;
      const data = {
        propertyId: payment.propertyId.toString(),
        paymentId: payment._id.toString(),
      };
      const mogulapikey = await config.mogulApiKey;
      await axios.post(`${(await config.apiUrls).marketplace}/invest`, data, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          mogulapikey,
        },
      });
    }
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

const fetchPlaidTransfer = async (payment) => {
  try {
    logger.info('Inside fetch plaid transfer service');
    const plaidTransferRequest = {
      client_id: plaid.client_id,
      secret: plaid.secret,
      transfer_id: payment.id,
    };
    const plaidTransferResponse = await plaidRequest('transfer/get', plaidTransferRequest);
    if (plaidTransferResponse?.error) return { error: plaidTransferResponse.error };

    if (plaidTransferResponse.transfer.status === 'failed' || plaidTransferResponse.transfer.status === 'returned') {
      await unblockTokensAndCredits(payment);

      if (plaidTransferResponse.transfer.status === 'returned') {
        const returnCode = plaidTransferResponse.transfer.failure_reason?.ach_return_code;
        const returnDateAndTimeISO = new Date().toISOString();
        const reportToPlaid = await reportReturnToPlaidSignal(payment.id, returnCode, returnDateAndTimeISO);
        if (!reportToPlaid || reportToPlaid.error) {
          logger.error('Error reporting ACH return for transfer ID ' + payment.id);
          payment.returnReported = false;
        } else {
          payment.returnReported = true;
        }
      }
      if (payment?.affiliate) {
        await updateReferralDocForAffiliate(payment._id);
      }
    }

    // Update payment status
    payment.status = plaidTransferResponse.transfer.status === 'settled' ? 'succeeded' : plaidTransferResponse.transfer.status;
    await payment.save();

    // Make an invest call to transfer tokens
    if (payment.status === 'succeeded' && payment.investmentStatus === 'pending') {
      await catchPlaidEvent(payment);
      // Add affiliate credits to referral user
      if (payment?.affiliate) {
        await addCreditsToReferralUser(payment._id);
      }
    }
    await payment.save();

    // If this transaction was part of a promotion, handle the promotional transaction
    if (payment.promoId) {
      if (!payment.referenceId) {
        logger.error(`Missing reference transaction for promotion ${payment.promoId}. Cannot complete promotion.`);
      } else {
        const promoPayment = await Payment.findOne({ referenceId: payment.id });
        if (!promoPayment) {
          logger.error(`Unable to find promotional Payment object with ID ${payment._id}`);
        } else {
          promoPayment.status = payment.status;
          await promoPayment.save();
          if (payment.status === 'succeeded') {
            await catchPlaidEvent(promoPayment);
          }
        }
      }
    }

    return;
  } catch (err) {
    logger.error(err.message);
    return handleError({ error: err.message });
  }
};

export const checkAndUpdatePlaidTransfers = async () => {
  try {
    logger.info('Inside check and update Plaid transfer cron service');
    const status = ['pending', 'posted'];
    for await (const payment of Payment.find({ status: { $in: status }, transactionType: 'Checkout'})) {
      await fetchPlaidTransfer(payment);
    }
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const retryBrexFailedTransfer = async () => {
  try {
    logger.info('Inside retry brex failed transfer cron service');
    const status = ['failed'];
    for await (const payment of Payment.find({ brexTransferStatus: { $in: status }, brexTransferFailureAttempt: { $lt: 3 }, transactionType: 'Checkout' })) {
      const property = await Property.findOne({ _id: payment.propertyId });
      if (!property) return;
      if (property?.financials?.brexPaymentInstrumentId) {
        // Initiate a transfer from sweep account (Brex) to property LLC (mercury) account
        const transfer = await brexTransfer(payment, property);
        if (transfer?.error) {
          payment.brexTransferStatus = 'failed';
          payment.brexTransferFailureReason = transfer.error;
          await payment.save();
          return;
        }
        payment.brexTransferId = transfer.id;
        payment.brexTransferStatus = transfer.status.toLowerCase();
      }
      await payment.save();
    }
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const checkForPlaidSweepStatus = async () => {
  try {
    logger.info('Inside check for plaid sweep status cron service');
    for await (const payment of Payment.find({
      status: 'succeeded',
      plaidSweepStatus: { $in: ['unswept', 'swept'] },
      transactionType: 'Checkout',
    })) {
      // Fetch Plaid transfer and check for sweep status
      const plaidTransferRequest = {
        client_id: plaid.client_id,
        secret: plaid.secret,
        transfer_id: payment.id,
      };
      const plaidTransferResponse = await plaidRequest('transfer/get', plaidTransferRequest);
      if (plaidTransferResponse?.error) return { error: plaidTransferResponse.error };

      payment.plaidSweepStatus = plaidTransferResponse.transfer.sweep_status;
      await payment.save();

      const property = await Property.findOne({ _id: payment.propertyId });
      // Sweep is not settled even after 30 days
      if (
        process.env.NODE_ENV === 'production' &&
        (payment.plaidSweepStatus === 'unswept' || payment.plaidSweepStatus === 'swept') &&
        new Date(payment.createdAt.setDate(payment.createdAt.getDate() + 30)) < new Date()
      ) {
        await auth_sendEmail({
          email: constants.reportEmail,
          type: constants.templateNames.PAYMENT_FAILED_SCENARIOS,
          request: {
            errorMessage: 'Plaid transfer to sweep account not settled. Internal investigation is needed.',
            paymentID: payment._id,
            amount: payment.amount.amount,
            propertyName: property.otherInfo.title ?? 'N/A',
          },
        });
      }

      // Sweept returned
      if (process.env.NODE_ENV === 'production' && payment.plaidSweepStatus === 'swept_returned') {
        await auth_sendEmail({
          email: constants.reportEmail,
          type: constants.templateNames.PAYMENT_FAILED_SCENARIOS,
          request: {
            errorMessage: 'Transfer to sweep account was returned. Please reach out to Plaid and investigate.',
            paymentID: payment._id,
            amount: payment.amount.amount,
            propertyName: property.otherInfo.title ?? 'N/A',
          },
        });
      }

      if (payment.plaidSweepStatus === 'swept_settled') {
        // Make Brex transfer
        const property = await Property.findOne({ _id: payment.propertyId });
        if (!property) return;
        if (property?.financials?.brexPaymentInstrumentId) {
          // Initiate a transfer of fee from sweep account (Brex) to Brex revenue sub-account
          const feeTransfer = await transferFeeToBrexRevenueAccount(payment.fees.amount, payment._id, `Processing Fee for property ${property.otherInfo.title}`);
          if (feeTransfer?.error) {
            payment.feeTransferStatus = 'failed';
            payment.feeTransferFailureReason = feeTransfer.error;
          } else {
            payment.feeTransferId = feeTransfer?.id;
            payment.feeTransferStatus = feeTransfer?.status?.toLowerCase();
          }
          await payment.save();

          // Initiate a transfer from sweep account (Brex) to property LLC (mercury) account
          const transfer = await brexTransfer(payment, property);
          if (transfer?.error) {
            payment.brexTransferStatus = 'failed';
            payment.brexTransferFailureReason = transfer.error;
            await payment.save();
          } else {
            payment.amountSettledToLLC = parseFloat((parseFloat(payment.amount.amount) - parseFloat(payment.fees.amount ?? 0) - parseFloat(payment.rewards ?? 0)).toFixed(2));
            payment.brexTransferId = transfer?.id;
            payment.brexTransferStatus = transfer?.status?.toLowerCase();
          }
          await payment.save();
        }
      }
    }
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

const processReferralData = async (referral) => {
  try {
    const IRInvestment = referral.referee.reduce((curr, next) => curr + next.amountSettled ?? 0, 0);
    let lastThreshold = referral.lastThreshold ?? 0;
    let bonus = 0; // 2.5% of threshold
    const thresholds = {
      0: 0,
      1: 100000,
      2: 250000,
      3: 500000,
      4: 1000000,
      5: 2500000,
      6: 5000000,
      7: 10000000,
      8: 20000000,
      9: 40000000,
    };
    if (IRInvestment <= thresholds[lastThreshold + 1]) return;
    let maxThreshold = thresholds[lastThreshold];
    let updatedThreshold = lastThreshold;
    Object.values(thresholds).forEach((threshold, index) => {
      if (IRInvestment >= threshold) {
        maxThreshold = threshold;
        updatedThreshold = index;
      }
    });
    let baseAmount = maxThreshold - thresholds[lastThreshold];
    bonus = baseAmount * (2.5 / 100);
    bonus = parseFloat(bonus.toFixed(2));
    await Referral.updateOne({ _id: referral._id }, { lastThreshold: updatedThreshold });
    const referralUser = await User.findOne({ _id: referral.referralId });
    const updatedReward = parseFloat((referralUser.credits + bonus).toFixed(2));
    await User.updateOne({ _id: referral.referralId }, { credits: updatedReward });
    const transferRequest = {
      id: await generateuuid(),
      amount: {
        amount: bonus,
      },
      transactionType: 'referral',
      transferType: 'received',
      status: 'completed',
      admin: false,
      merchant: false,
      userId: referral.referralId,
      referral: true,
      referralThreshold: thresholds[updatedThreshold],
    };
    await Transfer.create(transferRequest);
    return;
  } catch (err) {
    logger.error(err.message);
    return { hasError: true };
  }
};

export const checkForAffiliateThreshold = async () => {
  try {
    logger.info('Inside check for affiliate threshold cron service');
    const promiseResHandler = (resultArr) => {
      for (const result of resultArr) {
        if (result.status === 'rejected') {
          console.error(`Failed to process transaction id: ${result.value.id?.toString()}`);
          console.error('Reason:', result.value.error);
        }
      }
    };
    let promises = [];
    for await (const referralData of Referral.find({
      referee: { $ne: [] },
    })) {
      promises.push(processReferralData(referralData));
      if (promises.length >= 20) {
        await Promise.allSettled(promises).then(promiseResHandler);
        promises = [];
      }
    }
    await Promise.allSettled(promises).then(promiseResHandler);
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

const fetchMercuryTransfers = async (mercuryTx, payment) => {
  try {
    logger.info('Inside fetch mercury transfers service');
    const property = await Property.findOne({ _id: mercuryTx.propertyId });
    if (!property) return;
    const user = await User.findOne({ _id: payment._user });
    const transactionId = mercuryTx.transferId;
    const id = property.financials.mercuryRentAccountUuid; // Store this Id in property.financials doc
    if (!id) return;
    let transfer = await mercuryGetRequest(`account/${id}/transaction/${transactionId}`, property.financials.mercuryToken);
    if (transfer?.error) return;

    if (transfer.status === 'failed') {
      // Update status
      await Payment.updateOne({ 'withdrawnRentCredits.transferId': mercuryTx.transferId }, { 'withdrawnRentCredits.$.status': 'failed' });

      // Unblock rent credits
      const updatedRentCredits = user.rentCredits + mercuryTx.rentCredits;
      const updatedRentCreditsOnHold = user.rentCreditsOnHold - mercuryTx.rentCredits;
      user.rentCredits = updatedRentCredits;
      user.rentCreditsOnHold = updatedRentCreditsOnHold;
      await user.save();

      // Unclock rent credits from rent-balance
      await RentBalance.updateOne({ _id: mercuryTx.rentBalanceId }, { $inc: { rentCredits: mercuryTx.rentcredits, rentCreditsOnHold: -mercuryTx.rentCredits } });

      // Check and update for failed status
      await withdrawalFailedStatusCheck(payment._id);
      await withdrawalStatusCheckAndFundTransfer(payment._id);
    } else if (transfer.status === 'sent') {
      // Update status
      await Payment.updateOne(
        { 'withdrawnRentCredits.transferId': mercuryTx.transferId },
        { 'withdrawnRentCredits.$.status': 'completed', $inc: { withdrawRequestedRentCreditsSettled: mercuryTx.rentCredits } }
      );

      // Unblock rent credits
      const updatedRentCreditsOnHold = user.rentCreditsOnHold - mercuryTx.rentCredits;
      user.rentCreditsOnHold = updatedRentCreditsOnHold;
      await user.save();

      // Unclock rent credits from rent-balance
      await RentBalance.updateOne({ _id: mercuryTx.rentBalanceId }, { $inc: { rentCreditsOnHold: -mercuryTx.rentCredits } });

      // Check for all the payments settled
      await withdrawalStatusCheckAndFundTransfer(payment._id);
    } else {
      return;
    }
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const mercuryWithdrawalStatusCheck = async () => {
  try {
    logger.info('Inside mercury withdrawal status check cron service');
    let promises = [];
    for await (const payment of Payment.find({ status: 'pending', transactionType: 'Withdrawal' })) {
      payment.withdrawnRentCredits.forEach((el) => promises.push(fetchMercuryTransfers(el, payment)));
    }
    await Promise.allSettled(promises);
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const mercuryWithdrawalBatchCheck = async () => {
  try {
    logger.info('Inside mercury batch check cron service');
    // get all pending withdrawals
    const potentialBatchPayments = await Payment.find({ status: 'pending', transactionType: 'Withdrawal' });

    // get all txns for mercury rent -> brex rent by mercury rent id
    // only process with status "batch"
    const mercuryBatches = {};
    potentialBatchPayments.forEach((payment) => {
      payment.withdrawnRentCredits
        .filter((mercuryTx) => mercuryTx.status === 'batch')
        .forEach((mercuryTx) => {
          const propertyId = mercuryTx.propertyId;

          if (!mercuryBatches[propertyId]) {
            mercuryBatches[propertyId] = [];
          }

          mercuryBatches[propertyId].push({ ...mercuryTx, paymentId: payment._id });
        });
    });

    // create a mercury txn to brext rent account for each propertyId
    let promises = [];
    for await (const propertyId of Object.keys(mercuryBatches)) {
      const mercuryTransfers = mercuryBatches[propertyId];

      promises.push(mercuryBatchTransfers(mercuryTransfers, propertyId));
    }

    await Promise.allSettled(promises);
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

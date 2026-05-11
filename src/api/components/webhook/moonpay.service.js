import mongoose from 'mongoose';
import logger from '../../config/logger.js';
import config from '../../config/config.js';
import { TrackClient, RegionUS } from 'customerio-node';
import Payment from '../payment/model.js';
import AdminPayment from '../payment/paymentAdminModel.js';
import User from '../payment/userModel.js';
import Admin from '../payment/adminModel.js';
import Transfer from '../payment/transfers.model.js';
import constants from '../../config/constants.js';
import db from '../../connections/dbMaster.js';
import { sendToSocketWebhook } from '../../helpers/webhook.js';
import { auth_sendEmail } from '../../helpers/auth.js';
import { fetchUSDCBalance } from '../payment/moonpay.service.js';
import { makeInvestment, unblockTokensAndCredits } from '../payment/stripe.service.js';
import userModel from '../payment/userModel.js';
import { withdrawalFailedStatusCheck, withdrawalStatusCheckAndFundTransfer } from '../payment/service.js';
const Property = db.collection('property');
const { ObjectId } = mongoose.Types;

let cio = new TrackClient((await config.customerIO).siteId, (await config.customerIO).apiKey, {
  region: RegionUS,
});

export const catchEvent = async (notification) => {
  try {
    const data = notification.data;
    logger.info(notification.type);
    let doc;
    let admin = false;
    doc = await Payment.findOne({ id: data.id });
    if (!doc) {
      doc = await AdminPayment.findOne({ id: data.id });
      if (doc) admin = true;
    }

    let user = await User.findOne({ _id: ObjectId(data?.externalCustomerId) });
    if (!user) {
      user = await Admin.findOne({ _id: ObjectId(data?.externalCustomerId) });
      if (user) admin = true;
      else return { error: 'No user found.' };
    }

    if (notification?.type === 'transaction_created') {
      const eventData = {
        id: data.id,
        amount: {
          amount: data?.baseCurrencyAmount,
        },
        quoteCurrencyAmount: data?.quoteCurrencyAmount,
        fees: {
          amount: data?.feeAmount + data?.extraFeeAmount + data?.networkFeeAmount,
        },
        transactionType: 'Deposit',
        status: data.status,
        _user: data?.externalCustomerId,
        walletAddress: data?.walletAddress,
        walletAddressTag: data?.walletAddressTag,
        transactionHash: data?.cryptoTransactionId,
        failureReason: data?.failureReason,
        customerId: data?.customerId,
        cardId: data?.cardId,
        bankAccountId: data?.bankAccountId,
        paymentMethod: data?.paymentMethod,
        stages: data?.stages,
        createdAt: data?.createdAt,
        updatedAt: data?.updatedAt,
      };
      const firstDeposit = await Payment.find({ _user: data?.externalCustomerId });
      if (firstDeposit?.length === 0) {
        await User.updateOne({ _id: data?.externalCustomerId }, { firstDeposit: data?.quoteCurrencyAmount, firstDepositBal: data?.quoteCurrencyAmount });
      }
      if (admin) {
        await AdminPayment.create(eventData);
        await sendToSocketWebhook('moonpay', {
          _user: user._id,
          message: 'Moonpay transaction created',
          itemType: 'Moonpay',
          notificationType: 'transaction',
          id: data.id,
          status: data?.status,
          customerId: data?.customerId,
          failureReason: data?.failureReason,
          transactionHash: data?.cryptoTransactionId,
          createdAt: data?.createdAt,
        });
      } else {
        await Payment.create(eventData);
        await sendToSocketWebhook('moonpay', {
          _user: user._id,
          message: 'Moonpay transaction created',
          itemType: 'Moonpay',
          notificationType: 'transaction',
          id: data.id,
          status: data?.status,
          customerId: data?.customerId,
          failureReason: data?.failureReason,
          transactionHash: data?.cryptoTransactionId,
          createdAt: data?.createdAt,
        });
      }
      return;
    } else if (notification?.type === 'transaction_updated') {
      if (!doc) return { error: 'No transaction found.' };
      if (admin) {
        await AdminPayment.updateOne(
          {
            _id: doc._id,
          },
          {
            fees: {
              amount: data?.feeAmount + data?.extraFeeAmount + data?.networkFeeAmount,
            },
            status: data.status,
            transactionHash: data?.cryptoTransactionId,
            failureReason: data?.failureReason,
            cardId: data?.cardId,
            bankAccountId: data?.bankAccountId,
            stages: data?.stages,
            updatedAt: data?.updatedAt,
          }
        );
      } else {
        await Payment.updateOne(
          {
            _id: doc._id,
          },
          {
            fees: {
              amount: data?.feeAmount + data?.extraFeeAmount + data?.networkFeeAmount,
            },
            status: data.status,
            transactionHash: data?.cryptoTransactionId,
            failureReason: data?.failureReason,
            cardId: data?.cardId,
            bankAccountId: data?.bankAccountId,
            stages: data?.stages,
            updatedAt: data?.updatedAt,
          }
        );
      }
      if (data.status === 'completed') {
        if (process.env.NODE_ENV === 'production') {
          cio.identify(user.email, {
            account_funded: 1,
          });
        }
        await auth_sendEmail({
          type: constants.templateNames.DEPOSIT_SUCCESS,
          email: user?.email,
          request: {
            amount: parseFloat(data?.quoteCurrencyAmount),
            name: user?.firstName,
          },
        });
        await sendToSocketWebhook('notification', {
          _user: user,
          message: 'The deposit for ' + doc.amount.amount + ' is successful',
          itemId: doc._id,
          itemType: 'Payment',
          notificationType: 'activities',
          notificationFor: 'deposit',
        });

        const userWalletAddress = user.blockchainAddress;
        const balance = await fetchUSDCBalance(userWalletAddress);
        const balanceData = {
          balance: parseFloat(balance.toFixed(2)),
        };
        await sendToSocketWebhook('wallet-balance', {
          _user: doc._user,
          message: 'Wallet Balance',
          data: { ...balanceData },
        });
      }

      await sendToSocketWebhook('moonpay', {
        _user: doc._user,
        message: 'Moonpay transaction updated',
        itemType: 'Moonpay',
        notificationType: 'transaction',
        id: doc.id,
        status: data?.status,
        customerId: data?.customerId,
        failureReason: data?.failureReason,
        transactionHash: data?.cryptoTransactionId,
        updatedAt: data?.updatedAt,
      });
      return;
    } else if (notification?.type === 'transaction_failed') {
      if (!doc) return { error: 'No transaction found.' };
      if (admin) {
        await Payment.updateOne(
          {
            _id: doc._id,
          },
          {
            fees: {
              amount: data?.feeAmount + data?.extraFeeAmount + data?.networkFeeAmount,
            },
            status: data.status,
            transactionHash: data?.cryptoTransactionId,
            failureReason: data?.failureReason,
            cardId: data?.cardId,
            bankAccountId: data?.bankAccountId,
            stages: data?.stages,
            updatedAt: data?.updatedAt,
          }
        );
      } else {
        await Payment.updateOne(
          {
            _id: doc._id,
          },
          {
            fees: {
              amount: data?.feeAmount + data?.extraFeeAmount + data?.networkFeeAmount,
            },
            status: data.status,
            transactionHash: data?.cryptoTransactionId,
            failureReason: data?.failureReason,
            cardId: data?.cardId,
            bankAccountId: data?.bankAccountId,
            stages: data?.stages,
            updatedAt: data?.updatedAt,
          }
        );
      }
      await sendToSocketWebhook('moonpay', {
        _user: doc._user,
        message: 'Moonpay transaction failed',
        itemType: 'Moonpay',
        notificationType: 'transaction',
        id: doc.id,
        status: data?.status,
        customerId: data?.customerId,
        failureReason: data?.failureReason,
        transactionHash: data?.cryptoTransactionId,
        updatedAt: data?.updatedAt,
      });
      return;
    } else {
      return;
    }
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const catchAlchemyEvent = async (notification) => {
  try {
    logger.info('Inside catch alchemy request service');
    const data = notification.event.activity?.[0];
    let TxnExists = await Payment.findOne({ transactionHash: data?.hash });
    if (!TxnExists) TxnExists = await AdminPayment.findOne({ transactionHash: data?.hash });
    if (!TxnExists) TxnExists = await Transfer.findOne({ transactionHash: data?.hash });
    if (TxnExists) return;
    if (data?.rawContract?.address.toLowerCase() !== (await config.contracts).Usdc.address.toLowerCase()) {
      return;
    }
    /* For Deposits */
    let toUser = await User.findOne({ blockchainAddress: { $regex: data.toAddress, $options: 'i' } });
    if (!toUser) {
      toUser = await Admin.findOne({ blockchainAddress: { $regex: data.toAddress, $options: 'i' } });
      if (toUser) {
        const eventData = {
          id: notification.id,
          amount: {
            amount: data?.value,
            asset: data?.asset,
          },
          quoteCurrencyAmount: data?.value,
          transactionType: 'Deposit',
          status: 'completed',
          _user: toUser._id,
          walletAddress: data?.toAddress,
          fromAddress: data?.fromAddress,
          transactionHash: data?.hash,
          paymentMethod: notification?.event?.network,
          createdAt: notification?.createdAt,
          updatedAt: notification?.createdAt,
        };
        await AdminPayment.create(eventData);
        if (process.env.NODE_ENV === 'production') {
          cio.identify(toUser.email, {
            account_funded: 1,
          });
        }
        await auth_sendEmail({
          type: constants.templateNames.DEPOSIT_SUCCESS,
          email: toUser?.email,
          request: {
            amount: parseFloat(data?.value),
            name: toUser?.name,
          },
        });
      }
    } else {
      const eventData = {
        id: notification.id,
        amount: {
          amount: data?.value,
          asset: data?.asset,
        },
        quoteCurrencyAmount: data?.value,
        transactionType: 'Deposit',
        status: 'completed',
        _user: toUser._id,
        walletAddress: data?.toAddress,
        fromAddress: data?.fromAddress,
        transactionHash: data?.hash,
        paymentMethod: notification?.event?.network,
        createdAt: notification?.createdAt,
        updatedAt: notification?.createdAt,
      };
      const firstDeposit = await Payment.find({ _user: toUser._id });
      if (firstDeposit?.length === 0) {
        await User.updateOne({ _id: toUser._id }, { firstDeposit: data?.value, depositBalance: data?.value });
      }
      const paymentDoc = await Payment.create(eventData);
      const userWalletAddress = toUser.blockchainAddress;
      const balance = await fetchUSDCBalance(userWalletAddress);
      const balanceData = {
        balance: parseFloat(balance.toFixed(2)),
      };
      await sendToSocketWebhook('wallet-balance', {
        _user: paymentDoc._user,
        message: 'Wallet Balance',
        data: { ...balanceData },
      });
      await sendToSocketWebhook('notification', {
        _user: toUser,
        message: 'The deposit for ' + paymentDoc.amount.amount + ' is successful',
        itemId: paymentDoc._id,
        itemType: 'Payment',
        notificationType: 'activities',
        notificationFor: 'deposit',
      });
      await auth_sendEmail({
        type: constants.templateNames.DEPOSIT_SUCCESS,
        email: toUser?.email,
        request: {
          amount: parseFloat(data?.value),
          name: toUser?.firstName,
        },
      });
    }

    /* For Withdrawals */
    let fromAdmin = false;
    let fromUser = await User.findOne({ blockchainAddress: { $regex: data?.fromAddress, $options: 'i' } });
    if (!fromUser) {
      fromUser = await Admin.findOne({ blockchainAddress: { $regex: data?.fromAddress, $options: 'i' } });
      if (fromUser) fromAdmin = true;
      else return;
    }
    const fromEventData = {
      id: notification.id,
      amount: {
        amount: data?.value,
        asset: data?.asset,
      },
      quoteCurrencyAmount: data?.value,
      transactionType: 'Withdrawal',
      status: 'completed',
      _user: fromUser._id,
      walletAddress: data?.fromAddress,
      toAddress: data?.toAddress,
      transactionHash: data?.hash,
      paymentMethod: notification?.event?.network,
      createdAt: notification?.createdAt,
      updatedAt: notification?.createdAt,
    };
    if (fromAdmin) AdminPayment.create(fromEventData);
    else {
      const paymentDoc = await Payment.create(fromEventData);
      const userWalletAddress = fromUser.blockchainAddress;
      const balance = await fetchUSDCBalance(userWalletAddress);
      const balanceData = {
        balance: parseFloat(balance.toFixed(2)),
      };
      await sendToSocketWebhook('wallet-balance', {
        _user: paymentDoc._user,
        message: 'Wallet Balance',
        data: { ...balanceData },
      });
    }
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const catchStripeEvent = async (data) => {
  try {
    logger.info('Inside catch stripe request service');
    console.log('Stripe Event Received:', data);

    const user = await User.findOne({ 'stripe.customerId': data?.data?.object?.customer });

    switch (data.type) {
      case 'payment_intent.canceled':
        const paymentIntentCanceled = data.data.object;
        await Payment.findOneAndUpdate({ chargeId: paymentIntentCanceled.latest_charge }, { status: 'canceled' });
        break;

      case 'payment_intent.payment_failed':
        const paymentIntentPaymentFailed = data.data.object;
        // if (paymentIntentPaymentFailed.payment_method_types[0] === 'us_bank_account') {
        const paymentIntent = await Payment.findOne({ id: paymentIntentPaymentFailed.id });
        if (paymentIntent) {
          await Payment.findOneAndUpdate({ id: paymentIntentPaymentFailed.id }, { status: 'failed' });
          await unblockTokensAndCredits(paymentIntent);
        }
        // }
        break;

      case 'payment_intent.succeeded':
        const paymentIntentSucceeded = data.data.object;
        if (paymentIntentSucceeded.payment_method_types[0] === 'us_bank_account') {
          const paymentIntent = await Payment.findOne({ id: paymentIntentSucceeded.id });
          if (paymentIntent) {
            await Payment.findOneAndUpdate({ _id: paymentIntent._id }, { status: 'succeeded' });
            await makeInvestment(paymentIntent);
          }
        }
        break;

      case 'crypto.onramp_session.updated':
        if (data?.data?.object?.status === 'requires_payment') {
          /* Emit event only when txn is started or in progress */
          /* await sendToSocketWebhook('stripe', {
            _user: user._id ?? '',
            message: 'Stripe transaction initiated',
            itemType: 'Stripe',
            notificationType: 'transaction',
            id: data.data.object.id,
            status: 'pending',
          }); */
        } else if (data?.data?.object?.status === 'fulfillment_processing') {
          await sendToSocketWebhook('stripe', {
            _user: user._id ?? '',
            message: 'Stripe transaction initiated',
            itemType: 'Stripe',
            notificationType: 'transaction',
            id: data.data.object.id,
            status: 'pending',
          });
        } else if (data?.data?.object?.status === 'fulfillment_complete') {
          await sendToSocketWebhook('stripe', {
            _user: user._id ?? '',
            message: 'Stripe transaction updated',
            itemType: 'Stripe',
            notificationType: 'transaction',
            id: data.data.object.id,
            status: 'completed',
          });
        } else if (data?.data?.object?.status === 'fulfillment_failed') {
          await sendToSocketWebhook('stripe', {
            _user: user._id ?? '',
            message: 'Stripe transaction failed',
            itemType: 'Stripe',
            notificationType: 'transaction',
            id: data.data.object.id,
            status: 'failed',
          });
        } else {
          return;
        }
    }
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const catchPlaidEvent = async (data) => {
  try {
    logger.info('Inside catch plaid request service');
    const paymentIntentSucceeded = data;
    const paymentIntent = await Payment.findOne({ id: paymentIntentSucceeded.id });
    if (paymentIntent) {
      await Payment.findOneAndUpdate({ _id: paymentIntent._id }, { status: 'succeeded' });
      await makeInvestment(paymentIntent);
    }
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const catchBrexEvent = async (data) => {
  try {
    logger.info('Inside catch brex event request service');
    const payload = data;
    const eventType = payload.event_type;
    const { transfer_id } = payload;
    const payment = await Payment.findOne({ $or: [{ 'withdrawnIRCredits.transferId': transfer_id }, { brexTransferId: transfer_id }] });
    if (!payment) return;
    const user = await userModel.findOne({ _id: payment._user });
    switch (eventType) {
      case 'TRANSFER_PROCESSED':
        if (payment.transactionType === 'Checkout') {
          payment.brexTransferStatus = 'completed';
          await payment.save();
        } else if (payment.transactionType === 'Withdrawal') {
          await Payment.updateOne(
            { 'withdrawnIRCredits.transferId': transfer_id },
            { 'withdrawnIRCredits.status': 'completed', withdrawRequestedIRCreditsSettled: payment.withdrawRequestedIRCredits }
          );
          // Unblock rent credits
          const updatedCreditsOnHold = user.creditsOnHold - payment.withdrawRequestedIRCredits;
          user.creditsOnHold = updatedCreditsOnHold;
          await user.save();
          // Check for completed status and make funds transfer to user
          await withdrawalStatusCheckAndFundTransfer(payment._id);
        } else {
          break;
        }
        break;
      case 'TRANSFER_FAILED':
        if (payment.transactionType === 'Checkout') {
          payment.brexTransferStatus = 'failed';
          payment.brexTransferFailureAttempt = payment.brexTransferFailureAttempt + 1;
          const property = await Property.findOne({ _id: payment.propertyId });
          if (process.env.NODE_ENV === 'production' && payment.brexTransferFailureAttempt === 3) {
            await auth_sendEmail({
              email: constants.reportEmail,
              type: constants.templateNames.PAYMENT_FAILED_SCENARIOS,
              request: {
                errorMessage: 'Transfer from Brex sweep account to Mercury property LLC account failed. Please investigate.',
                paymentID: payment._id,
                amount: payment.amount.amount,
                propertyName: property.otherInfo.title ?? 'N/A',
              },
            });
          }
        } else if (payment.transactionType === 'Withdrawal') {
          payment.withdrawnIRCredits.status = 'failed';
          await payment.save();

          // Unblock credits and revert back to user account
          const updatedCredits = user.credits + payment.credits;
          const updatedCreditsOnHold = user.creditsOnHold - payment.credits;
          user.credits = updatedCredits;
          user.creditsOnHold = updatedCreditsOnHold;
          await user.save();

          // Check for all txn status and make funds transfer to user
          await withdrawalFailedStatusCheck(payment._id);
          await withdrawalStatusCheckAndFundTransfer(payment._id);
        }
        await payment.save();
        break;
      default:
        throw new Error('Unknown event type');
    }
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

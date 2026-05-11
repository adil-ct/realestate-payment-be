import _ from 'lodash';
import dotenv from 'dotenv';
import logger from '../../config/logger.js';
import paymentModel from '../payment/model.js';
import userModel from '../payment/userModel.js';
import adminModel from '../payment/adminModel.js';
import db from '../../connections/dbMaster.js';
import { generateuuid } from '../../helpers/helpers.js';
import { createTransfer, paymentBySettlementId } from '../../helpers/circle.js';
import { sendToSocketWebhook } from '../../helpers/webhook.js';
import { auth_sendEmail } from '../../helpers/auth.js';
import adminPaymentModel from '../payment/paymentAdminModel.js';
import constants from '../../config/constants.js';
import moment from 'moment';
const configModel = db.collection('config');
dotenv.config();

export const catchRequest = async (notification) => {
  try {
    logger.info('Inside catch request webhook service');
    const request = JSON.parse(notification.Message);
    logger.info(request);
    let paymentDoc;
    let type;
    const configData = await configModel.findOne({});
    if (request.notificationType === 'payouts') {
      const userPayout = await paymentModel.findOne({
        id: request.payout.id,
        transactionType: 'Withdrawal',
      });
      if (!userPayout) {
        const adminPayout = await adminPaymentModel.findOne({
          id: request.payout.id,
          transactionType: 'Withdrawal',
        });
        if (!adminPayout) return;
        type = 'admin';
        paymentDoc = adminPayout;
      } else {
        type = 'user';
        paymentDoc = userPayout;
      }

      if (request.payout.status === 'failed') {
        paymentDoc.status = 'failed';
        await paymentDoc.save();
      }
      let fees;
      if (paymentDoc.accountInfo.medium === 'wire') {
        fees = {
          amount: configData.wirePayoutFee.toString(),
          currency: 'USD',
        };
      } else {
        fees = {
          amount: (
            configData.achPayoutFee +
            (configData.achPayoutFeePercentage / 100) *
              parseFloat(paymentDoc.amount.amount)
          ).toString(),
          currency: 'USD',
        };
      }
      paymentDoc.fees = fees;
      paymentDoc.status = request.payout.status;
      await paymentDoc.save();
      const user = await getWalletId(paymentDoc.accountInfo.id, type, 'bank');
      await sendToSocketWebhook('notification', {
        _user: user,
        message:
          'The withdrawal for ' + paymentDoc.amount.amount + ' is successful',
        itemId: paymentDoc._id,
        itemType: 'Payment',
        notificationType: 'activities',
      });
      await auth_sendEmail({
        type: constants.templateNames.WITHDRAWAL_SUCCESS,
        email: user.email,
        request: {
          amount: parseFloat(paymentDoc.amount.amount),
          name: user?.firstName,
        },
      });
      return;
    } else if (request.notificationType === 'payments') {
      if (
        process.env.NODE_ENV === 'production' &&
        request.payment.source.type === 'wire'
      ) {
        logger.info('Inside production wire payment console');
        const isUser = await userModel.findOne({
          'bank.trackingRef': request.payment.trackingRef,
        });
        logger.info('isUser = ', isUser);
        if (!isUser) {
          const isAdmin = await adminModel.findOne({
            'bank.trackingRef': request.payment.trackingRef,
          });
          logger.info('isAdmin = ', isAdmin);
          if (!isAdmin) return;
          const payment = {
            amount: request?.payment?.amount,
            status: 'pending',
            transactionType: 'Deposit',
            _user: isAdmin?._id,
            accountInfo: {
              medium: 'wire',
              id: request.payment.source.id,
            },
          };
          isAdmin.bank.forEach((el) => {
            if (el.trackingRef == request.payment.trackingRef) {
              payment.accountInfo.description = el.description;
            }
          });
          paymentDoc = await adminPaymentModel.create(payment);
          type = 'admin';
        } else {
          const payment = {
            amount: request?.payment?.amount,
            status: 'pending',
            transactionType: 'Deposit',
            _user: isUser?._id,
            accountInfo: {
              medium: 'wire',
              id: request.payment.source.id,
            },
          };
          isUser.bank.forEach((el) => {
            if (el.trackingRef == request.payment.trackingRef) {
              payment.accountInfo.description = el.description;
            }
          });
          paymentDoc = await paymentModel.create(payment);
          logger.info('paymentDoc = ', paymentDoc);
          type = 'user';
        }
      } else {
        const requestQuery = {
          'amount.amount': request.payment.amount.amount,
          'amount.currency': request.payment.amount.currency,
          status: 'pending',
          transactionType: 'Deposit',
          'accountInfo.medium': request.payment.source.type,
          'accountInfo.id': request.payment.source.id,
        };
        if (
          request.payment.source.type === 'ach' ||
          request.payment.source.type === 'card'
        ) {
          requestQuery.id = request.payment.id;
        }
        const userPayment = await paymentModel.findOne(requestQuery);
        if (!userPayment) {
          const adminPayment = await adminPaymentModel.findOne(requestQuery);
          if (!adminPayment) return;
          type = 'admin';
          paymentDoc = adminPayment;
        } else {
          type = 'user';
          paymentDoc = userPayment;
        }

        // paymentDoc.id = request.payment.id;
        // await paymentDoc.save();

        // if (request.payment.status === 'failed') {
        //   paymentDoc.status = 'failed';
        //   await paymentDoc.save();
        //   return;
        // }
      }
      paymentDoc.id = request.payment.id;
      await paymentDoc.save();

      if (request.payment.status === 'failed') {
        paymentDoc.status = 'failed';
        await paymentDoc.save();
        return;
      }
      let fees;
      if (request.payment.source.type === 'wire') {
        fees = {
          amount: configData.wirePaymentFee.toString(),
          currency: 'USD',
        };
      } else if (request.payment.source.type === 'ach') {
        fees = {
          amount: (
            configData.achPaymentFee +
            (configData.achPaymentFeePercentage / 100) *
              parseFloat(request.payment.amount.amount)
          ).toString(),
          currency: 'USD',
        };
      } else {
        fees = {
          amount: (
            configData.cardFees +
            (configData.cardFeesPercentage / 100) *
              parseFloat(request.payment.amount.amount)
          ).toString(),
          currency: 'USD',
        };
      }

      if (request.payment.source.type === 'card') {
        paymentDoc.fees = fees;
        await paymentDoc.save();
        return;
      }

      if (request.payment.source.type === 'ach') {
        paymentDoc.fees = fees;
        paymentDoc.status = request.payment.status;
        await paymentDoc.save();
        return;
      }

      let paymentMethod =
        request.payment.source.type === 'wire' ||
        request.payment.source.type === 'ach'
          ? 'bank'
          : 'card';
      const userWallet = await getWalletId(
        request.payment.source.id,
        type,
        paymentMethod
      );
      logger.info(userWallet);
      if (!paymentDoc.isCircleTransferred) {
        if (paymentDoc?.merchantPayment === true) {
          paymentDoc.fees = fees;
          paymentDoc.isCircleTransferred = true;
          paymentDoc.status = request.payment.status;
          await paymentDoc.save();
          return;
        } else {
          const transfer = await circleTransfer({
            amount: (
              parseFloat(request.payment.amount.amount) -
              parseFloat(fees.amount)
            ).toString(),
            source: request.payment.merchantWalletId,
            destination: userWallet?.circle?.walletId
              ? userWallet.circle.walletId
              : userWallet._doc.circle.walletId,
          });
          if (transfer?.error || transfer === null) return;
          paymentDoc.fees = fees;
          paymentDoc.isCircleTransferred = true;
          paymentDoc.status = request.payment.status;
          // const userDoc = await userModel.findOne({_id: paymentDoc._user})
          await paymentDoc.save();
          await sendToSocketWebhook('notification', {
            _user: userWallet,
            message:
              'The deposit for ' +
              request.payment.amount.amount +
              ' is successful',
            itemId: paymentDoc._id,
            itemType: 'Payment',
            notificationType: 'activities',
          });
          await auth_sendEmail({
            type: constants.templateNames.DEPOSIT_SUCCESS,
            email: userWallet.email,
            request: {
              amount: parseFloat(request.payment.amount.amount),
              name: userWallet?.firstName,
            },
          });
          return transfer;
        }
      }
    } else if (request.notificationType === 'settlements') {
      const paymentId = await paymentBySettlementId(request.settlement.id);
      if (paymentId.data.length === 0) return;
      const requestQuery = {
        id: paymentId.data[0].id,
        'accountInfo.id': paymentId.data[0].source.id,
        // 'accountInfo.medium': 'card',
      };
      const userPayment = await paymentModel.findOne(requestQuery);
      if (!userPayment) {
        const adminPayment = await adminPaymentModel.findOne(requestQuery);
        if (!adminPayment) return;
        type = 'admin';
        paymentDoc = adminPayment;
      } else {
        type = 'user';
        paymentDoc = userPayment;
      }

      if (paymentId.data[0].status === 'failed') {
        paymentDoc.status = 'failed';
        await paymentDoc.save();
      }
      const fees = paymentDoc.fees;
      let paymentMethod =
        paymentDoc.accountInfo.medium === 'ach' ? 'bank' : 'card';
      const userWallet = await getWalletId(
        paymentId.data[0].source.id,
        type,
        paymentMethod
      );
      if (!paymentDoc.isCircleTransferred) {
        if (paymentDoc?.merchantPayment === true) {
          paymentDoc.isCircleTransferred = true;
          paymentDoc.status = paymentId.data[0].status;
          await paymentDoc.save();
          return;
        } else {
          const transfer = await circleTransfer({
            amount: (
              parseFloat(paymentId.data[0].amount.amount) -
              parseFloat(fees.amount)
            ).toString(),
            source: paymentId.data[0].merchantWalletId,
            destination: userWallet?.circle?.walletId
              ? userWallet.circle.walletId
              : userWallet._doc.circle.walletId,
          });
          if (transfer?.error) return;
          paymentDoc.isCircleTransferred = true;
          paymentDoc.status = paymentId.data[0].status;
          const userDoc = await userModel.findOne({ _id: paymentDoc._user });
          await paymentDoc.save();
          await sendToSocketWebhook('notification', {
            _user: userDoc,
            message:
              'The deposit for ' + paymentDoc.amount.amount + ' is successful',
            itemId: paymentDoc._id,
            itemType: 'Payment',
            notificationType: 'activities',
          });
          if (paymentMethod === 'bank') {
            const config = await configModel.findOne({});
            const achWithdrawAllowed = config?.achWithdrawAllowed;
            await userModel.updateOne(
              { _id: userWallet._id },
              {
                $push: {
                  achWithdrawBlockedFunds: {
                    amount: parseInt(paymentId.data[0].amount.amount),
                    withdrawAllowedDate: moment()
                      .startOf('day')
                      .add(achWithdrawAllowed, 'days')
                      .utc()
                      .toDate(),
                  },
                },
              }
            );
            await auth_sendEmail({
              type: constants.templateNames.DEPOSIT_SUCCESS,
              email: userWallet.email,
              request: {
                amount: parseFloat(paymentId.data[0].amount.amount),
                name: userWallet?.firstName,
              },
            });
          } else {
            await auth_sendEmail({
              type: constants.templateNames.DEPOSIT_SUCCESS,
              email: userWallet.email,
              request: {
                amount: parseFloat(paymentId.data[0].amount.amount),
                name: userWallet?.firstName,
              },
            });
          }
          return transfer;
        }
      } else {
        if (paymentMethod === 'bank') {
          const config = await configModel.findOne({});
        }
        const achWithdrawAllowed = config?.achWithdrawAllowed;
        await userModel.updateOne(
          { _id: userWallet._id },
          {
            $push: {
              achWithdrawBlockedFunds: {
                amount: parseInt(paymentId.data[0].amount.amount),
                withdrawAllowedDate: moment()
                  .startOf('day')
                  .add(achWithdrawAllowed, 'days')
                  .utc()
                  .toDate(),
              },
            },
          }
        );
      }
    } else if (request.notificationType === 'ach') {
      const ach = await userModel.findOne({
        'bank.id': request.ach.id,
      });
      await userModel.updateOne(
        { _id: ach._id, 'bank.id': request.ach.id },
        {
          $set: {
            'bank.$.status': request.ach.status,
            'bank.$.description':
              request.ach?.bankAddress?.bankName + request.ach?.accountNumber,
          },
        }
      );
    } else if (request.notificationType === 'wire') {
      const wire = await userModel.findOne({
        'bank.id': request.wire.id,
      });
      await userModel.updateOne(
        { _id: wire._id, 'bank.id': request.wire.id },
        {
          $set: { 'bank.$.status': request.wire.status },
        }
      );
    } else if (request.notificationType === 'cards') {
      const card = await userModel.findOne({
        'cards.cardId': request.card.id,
      });
      await userModel.updateOne(
        { _id: card._id, 'cards.cardId': request.card.id },
        {
          $set: { 'cards.$.status': request.card.status },
        }
      );
    }
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getWalletId = async (id, type, paymentMethod) => {
  try {
    logger.info('Inside get wallet Id webhook service');
    let wallet;
    if (type === 'user') {
      if (paymentMethod === 'bank') {
        wallet = await userModel.findOne({
          'bank.id': id,
        });
      } else {
        wallet = await userModel.findOne({
          'cards.cardId': id,
        });
      }
    } else {
      if (paymentMethod === 'bank') {
        wallet = await adminModel.findOne({
          'bank.id': id,
        });
      } else {
        wallet = await adminModel.findOne({
          'cards.cardId': id,
        });
      }
    }
    return wallet;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const circleTransfer = async (data) => {
  try {
    logger.info('Inside circle transfer webhook service');
    const idempotencyKey = await generateuuid();
    const request = {
      idempotencyKey: idempotencyKey,
      source: {
        type: 'wallet',
        id: data.source,
      },
      destination: {
        type: 'wallet',
        id: data.destination,
      },
      amount: {
        amount: data.amount,
        currency: 'USD',
      },
    };
    const transferCircle = await createTransfer(request);
    if (transferCircle?.error || transferCircle.status === 400) {
      return {
        error:
          transferCircle?.error || transferCircle?.errorCode || 'Bad Request',
      };
    }
    if (transferCircle.status === 200 || transferCircle.status === 201) {
      return transferCircle;
    }
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

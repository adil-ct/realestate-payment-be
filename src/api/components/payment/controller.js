import mongoose from 'mongoose';
import { TrackClient, RegionUS } from 'customerio-node';
import logger from '../../config/logger.js';
import messages from '../../config/messages.js';
import config from '../../config/config.js';
import userModel from '../payment/userModel.js';
import { handleError, handleResponse } from '../../helpers/requestHandler.js';
import {
  wireAccountRequest,
  achRequest,
  wirePaymentRequest,
  cardRequest,
  paymentRequest,
  payoutRequest,
  unlinkRequest,
  editCardRequest,
  validatePaymentMethod,
  withdrawCreditsValidator,
  manualCheckoutValidator,
  addVendorValidator,
} from './validator.js';
import { generateuuid } from '../../helpers/helpers.js';
import {
  createWire,
  getBankAccounts,
  getBalance,
  createAch,
  ach_payment,
  getMasterWallet,
  wire_payment,
  card_payment,
  createPayout,
  getCardDetails,
  updateCircleCard,
  getWireInstruction,
  list_subscription,
  circle_subscribe,
  createTransfer,
  get_configuration,
  createMockAch,
  getAllWallets,
} from '../../helpers/circle.js';
import {
  addWireInfoToUser,
  addAchInfoToUser,
  addCardService,
  addCardInfoToUser,
  addTransactionToUser,
  createPayoutDoc,
  createWirePaymentDoc,
  getUserTransaction,
  getTransactionByType,
  updateUser,
  updateAdmin,
  getFees,
  createEncryptedData,
  deleteCardService,
  getAllTransactions,
  getUserDetails,
  getPaymentTypes,
  updatePaymentMethod,
  usdcTransfer,
  validateAddress,
  createOnrampSession,
  decryptKey,
  fetchReferralTxn,
  fetchMoonpayFee,
  withdrawCreditsToBank,
  checkoutAndTokenTransfer,
  getUserPromotionDetails,
  getAdminPromotionDetails,
  getAdminPromotionUserDetails,
  addOrUpdatePromotion,
  getPromotionTransactionsForUser,
} from './service.js';
import { sendToSocketWebhook } from '../../helpers/webhook.js';
import { link_token, processor_token } from '../../helpers/plaid.js';
import db from '../../connections/dbMaster.js';
const configModel = db.collection('config');
const Referral = db.collection('referral');
const PropertyModel = db.collection('property');
import bcrypt from 'bcrypt';
import message from '../../config/messages.js';
import paymentModel from './model.js';
import paymentAdminModel from './paymentAdminModel.js';
import adminModel from './adminModel.js';
import transfersModel from './transfers.model.js';
import { auth_sendEmail } from '../../helpers/auth.js';
import constants from '../../config/constants.js';
import { createWidgetURL, fetchUSDCBalance, createSardineWidgetURL, createTransakURL } from './moonpay.service.js';
import VenlyHelperClass from '../../helpers/venly.helper.js';
import { tokensAvailableAtSale } from './stripe.service.js';
import { brexPostRequest } from './brex.service.js';
import { plaidRequest } from './plaid.service.js';
const ObjectId = mongoose.Types.ObjectId;
const VenlyHelper = new VenlyHelperClass();
let cio = new TrackClient((await config.customerIO).siteId, (await config.customerIO).apiKey, {
  region: RegionUS,
});

export const createBankWire = async (req, res) => {
  try {
    logger.info('Inside create bank wire API controller');
    const validation = await wireAccountRequest(req.body);
    if (validation?.error) {
      return handleError({
        res,
        err: validation.message,
      });
    }
    const user = req.user;
    req.body.idempotencyKey = await generateuuid();

    req.body.billingDetails.bankName == '' ? delete req.body.billingDetails.bankName : null;
    req.body.billingDetails.city == '' ? delete req.body.billingDetails.city : null;
    req.body.billingDetails.district == '' ? delete req.body.billingDetails.district : null;

    const wireStatus = await createWire(req.body);
    if (wireStatus?.error || wireStatus?.status === 400) {
      return handleError({
        res,
        err: wireStatus?.error || messages.INVALID_DATA,
      });
    }
    const addToUserData = {
      id: wireStatus.data.id,
      trackingRef: wireStatus.data.trackingRef,
      description: wireStatus.data.description,
      bankType: req.body.bankType,
    };
    if (req.body.bankType === 'USBANK' || req.body.bankType === 'NONUS-NIBAN') {
      addToUserData.accountNumber = req.body.accountNumber;
    } else {
      addToUserData.accountNumber = req.body.iban;
    }
    const addToUser = await addWireInfoToUser(user._id, user.userType, addToUserData);
    if (addToUser?.error) {
      return handleError({
        res,
        err: addToUser.error,
      });
    }
    const response = {
      _id: addToUser._id,
      bankName: wireStatus.data.bankAddress.bankName,
      type: 'wire',
      id: wireStatus.data.id,
      accountHolder: wireStatus.data.billingDetails.name,
    };
    if (req.body.bankType === 'USBANK' || req.body.bankType === 'NONUS-NIBAN') {
      response.accountNumber = req.body.accountNumber;
    }
    wireStatus.data.accountNumber = req.body.accountNumber;
    await sendToSocketWebhook('notification', {
      _user: user,
      message: wireStatus.data.bankAddress.bankName + ' is linked to mogul successfully',
      itemId: response._id,
      itemType: 'Bank',
      notificationType: 'activities',
    });
    return handleResponse({
      res,
      msg: messages.WIRE_ACCOUNT_SUCCESS,
      data: response,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const bankAccounts = async (req, res) => {
  try {
    logger.info('Inside bank account API controller');
    const user = req.user;
    const { page, limit } = req.query;
    const perPage = limit > 0 ? +limit : 20;
    const startIndex = page > 0 ? +page - 1 : 0;
    let banks = [];
    let errorStack = [];
    for (let i = 0; i < user.bank?.length; i++) {
      let bankAcc = await getBankAccounts(user.bank[i].id, user.bank[i].type.toLowerCase());
      if (bankAcc.status === 200) {
        if (user.bank[i].type === 'wire') {
          bankAcc.data.accountNumber = user.bank[i]?.accountNumber;
        }
        if (user.bank[i].type === 'ACH') {
          bankAcc.data.plaid_created_at = user.bank[i]?.plaid_created_at;
        }
        bankAcc.data._id = user.bank[i]?._id;
        banks.push({
          _id: bankAcc.data._id,
          bankName: bankAcc.data.bankAddress.bankName,
          status: bankAcc.data.status,
          accountNumber: bankAcc.data?.accountNumber,
          type: user.bank[i].type,
          id: user.bank[i].id,
          accountHolder: bankAcc.data.billingDetails.name,
          routingNumber: bankAcc.data.routingNumber ?? '',
          plaid_created_at: bankAcc?.data?.plaid_created_at,
        });
      } else {
        errorStack.push(bankAcc);
      }
    }
    banks.forEach((el) => {
      delete el.trackingRef;
      delete el.fingerprint;
    });
    const totalCount = banks.length;
    banks = banks.slice(startIndex * perPage, startIndex * perPage + perPage);

    return handleResponse({
      res,
      msg: messages.BANK_ACCOUNTS_LIST,
      data: { totalCount, banks },
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const getWireInstructionController = async (req, res) => {
  try {
    const { trackingId } = req.params;
    const wireInstruction = await getWireInstruction(trackingId);
    return handleResponse({
      res,
      msg: messages.WIRE_INSTRUCTION_LIST,
      data: wireInstruction,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({
      res,
      err: err.message,
    });
  }
};

export const walletBalance = async (req, res) => {
  try {
    logger.info('Inside wallet balance API controller');
    const user = req.user;
    let address = user?.blockchainAddress;
    if (user?.userType === 'admin' && req.query.userId) {
      const getUser = await getUserDetails(req.query.userId);
      if (!getUser) {
        return handleError({ res, err: messages.NO_WALLET, statusCode: 400 });
      }
      address = getUser?.blockchainAddress;
    }
    let data;
    if (address) {
      let balance = {
        balance: 0,
        credits: user?.credits ? user.credits : 0,
      };
      //await fetchUSDCBalance(address);
      // if (balance?.error) return handleError({ res, err: balance.error });
      // data = {
      //   balance: parseFloat(balance.toFixed(2)),
      //   credits: user?.credits ? user.credits : 0,
      // };
      data = {
        balance: 0,
        credits: user?.credits ? user.credits : 0,
      };

      if (process.env.NODE_ENV === 'production') {
        cio.identify(user.email, {
          account_balance: '$' + parseFloat(balance.toFixed(2)),
        });
      }
    } else {
      data = {
        balance: 0,
        credits: user?.credits ? user.credits : 0,
      };
      return handleResponse({ res, msg: messages.WALLET_BALANCE, data });
    }
    return handleResponse({
      res,
      msg: messages.WALLET_BALANCE,
      data,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const linkToken = async (req, res) => {
  try {
    logger.info('Inside plaid link token API cotroller');
    const user = req.user;
    const link = await link_token(user.userType === 'admin' ? user.name : user.firstName, user._id);
    if (link?.error) {
      return handleError({
        res,
        err: link.error,
      });
    }
    return handleResponse({
      res,
      msg: messages.PLAID_LINK_TOKEN,
      data: link,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const createCircleACH = async (req, res) => {
  try {
    logger.info('Inside create Circle ACH API controller');
    const user = req.user;
    req.body.metadata.email = req.user.email;
    let ach;

    const validation = await achRequest(req.body);
    if (validation?.error) {
      return handleError({
        res,
        err: validation.message,
      });
    }
    let processorToken;
    if (process.env.NODE_ENV === 'production') {
      processorToken = await processor_token(req.body.publicToken);
      if (processorToken?.error) {
        return handleError({
          res,
          err: processorToken.error,
        });
      }
      delete req.body.publicToken;
    } else {
      let payload = {
        account: {
          accountNumber: '123456789',
          routingNumber: '011000028',
          description: 'ACH Payment',
        },
        balance: {
          amount: 5000,
          currency: 'USD',
        },
      };
      ach = await createMockAch(payload);
      processorToken = ach.data.processorToken;
    }
    req.body.plaidProcessorToken = processorToken;
    req.body.idempotencyKey = await generateuuid();
    ach = await createAch(req.body);

    if (ach?.error) {
      return handleError({ res, err: ach.error });
    }
    const addToUser = await addAchInfoToUser(user._id, user.userType, {
      id: ach.data.id,
      bankAccountType: ach.data.bankAccountType,
      plaidToken: req.body.plaidProcessorToken,
      plaid_created_at: req.body?.plaid_created_at,
    });
    if (addToUser?.error) {
      return handleError({
        res,
        err: addToUser.error,
      });
    }
    ach.data.accountHolder = {
      firstName: user.firstName,
      lastName: user.lastName,
    };
    return handleResponse({
      res,
      msg: messages.ACH_SUCCESS,
      data: ach.data,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

const checkLimit = async (user, data, txnType) => {
  try {
    let transaction;
    const configDoc = await configModel.findOne();
    let dailyLimit;
    if (txnType == 'Deposit') {
      if (data?.source?.type == 'ach') {
        dailyLimit = configDoc.depositACHLimit;
      } else if (data?.wireId) {
        data.source.type = 'wire';
        dailyLimit = configDoc.depositWireLimit;
      }
    } else if (txnType == 'Withdrawal') {
      if (data.destination?.type == 'ach') {
        dailyLimit = configDoc.withdrawACHLimit;
      } else if (data.destination?.type == 'wire') {
        dailyLimit = configDoc.withdrawWireLimit;
      }
    }
    var start = new Date();
    start.setHours(0, 0, 0, 0);

    var end = new Date();
    end.setHours(23, 59, 59, 999);
    if (user.userType === 'admin') {
      transaction = await paymentAdminModel.find({
        _user: user._id,
        transactionType: txnType,
        createdAt: { $gte: start, $lt: end },
      });
    } else {
      transaction = await paymentModel.find({
        _user: user._id,
        transactionType: txnType,
        createdAt: { $gte: start, $lt: end },
      });
    }
    let totalTxn = 0;
    transaction.forEach((element) => {
      if (element.accountInfo.medium === data?.source?.type) {
        totalTxn += parseInt(element.amount.amount);
      }
    });
    if (parseInt(data.amount.amount) + totalTxn <= dailyLimit) {
      return true;
    } else {
      return false;
    }
  } catch (err) {
    logger.error(err.message);
    return { err, message };
  }
};

export const createPayment = async (req, res) => {
  try {
    logger.info('Inside Create Payment API controller');
    const validation = await paymentRequest(req.body);
    if (validation?.error) {
      return handleError({
        res,
        err: validation.message,
      });
    }
    req.body.metadata.email = req.user.email;
    const user = req.user;
    let description;
    if (req.body.source.type === 'card') {
      user.cards.forEach((card) => {
        if (card.cardId == req.body.source.id) {
          if (card.status === 'pending' || card.status === 'failed') {
            return handleError({
              res,
              err: messages.PAYMENT_METHOD_NOT_VERIFIED,
              statusCode: 400,
            });
          }
          description = card.description;
        }
      });
    } else if (req.body.source.type === 'ach') {
      user.bank.forEach((bank) => {
        if (bank.id === req.body.source.id) {
          if (bank.status === 'pending' || bank.status === 'failed') {
            return handleError({
              res,
              err: messages.PAYMENT_METHOD_NOT_VERIFIED,
              statusCode: 400,
            });
          }
          description = bank.description;
        }
      });
      let limitFlag;
      if (req.body?.type === 'merchant') {
        limitFlag = true;
      } else {
        limitFlag = await checkLimit(user, req.body, 'Deposit');
      }
      if (!limitFlag) {
        return handleError({
          res,
          err: messages.DAILY_TRANSACTION_LIMIT_REACHED,
          statusCode: 400,
        });
      }
    }
    const merchant = req.body?.type === 'merchant' ? true : false;
    req.body.amount.amount = parseFloat(req.body.amount.amount).toFixed(2);
    req.body.idempotencyKey = await generateuuid();
    req.body.verification = 'none';
    req.body.keyId = 'Key1';
    let circleTransfer = false;
    let payment;
    if (req.body.source.type == 'ach') {
      payment = await ach_payment(req.body);
      if (payment?.error) {
        ('');
        await sendToSocketWebhook('notification', {
          _user: user,
          message: 'The deposit for ' + req.body.amount.amount + ' has failed. ' + payment.error,
          itemId: null,
          itemType: 'Payment',
          notificationType: 'activities',
        });
        return handleError({
          res,
          err: payment.error,
        });
      } else if (payment.status === 'pending') {
        if (!merchant) {
          const source = await getMasterWallet();
          if (source?.error) {
            return handleError({ res, err: source.error });
          }
          let balance = await getBalance(source);
          if (balance?.error) {
            return handleError({ res, err: balance.error });
          }
          if (!balance || balance.length === 0) balance = 0;
          else balance = balance[0].amount;
          const configData = await configModel.findOne({});
          const amount = (
            parseFloat(payment.amount.amount) -
            (configData.achPaymentFee + (configData.achPaymentFeePercentage / 100) * parseFloat(payment.amount.amount))
          ).toString();
          if (parseFloat(balance) >= configData?.achDirectTransferThreshold && parseFloat(balance) >= parseFloat(amount)) {
            const destination = user.circle?.walletId;
            const idempotencyKey = await generateuuid();
            const request = {
              idempotencyKey: idempotencyKey,
              source: {
                type: 'wallet',
                id: source,
              },
              destination: {
                type: 'wallet',
                id: destination,
              },
              amount: {
                amount: amount,
                currency: 'USD',
              },
            };
            const transfer = await createTransfer(request);
            if (transfer?.error) {
              return handleError({ res, err: transfer.error });
            }
            circleTransfer = true;
            payment.status = 'complete';
            await sendToSocketWebhook('notification', {
              _user: user,
              message: 'The deposit for ' + req.body.amount.amount + ' is successful',
              itemId: transfer.id,
              itemType: 'Payment',
              notificationType: 'activities',
            });
            await auth_sendEmail({
              type: constants.templateNames.DEPOSIT_SUCCESS,
              email: user.email,
              request: { amount: parseFloat(amount) },
            });
          }
        }
      }
    }
    if (req.body.source.type == 'card') {
      payment = await card_payment(req.body);
      if (payment?.error) {
        await sendToSocketWebhook('notification', {
          _user: user,
          message: 'The deposit for ' + req.body.amount.amount + ' has failed. ' + payment.error,
          itemId: null,
          itemType: 'Payment',
          notificationType: 'activities',
        });
        return handleError({
          res,
          err: payment.error,
        });
      }
      if (payment) {
        let card = await getCardDetails(req.body.source.id);
        req.body.source.cardNumber = `**** **** **** ${card.data.last4}`;
        payment.cardNumber = req.body.source.cardNumber;
      }
    }
    const addTransaction = await addTransactionToUser(user._id, user.userType, payment, merchant, description, circleTransfer);
    // await sendToSocketWebhook('notification', {
    //   _user: user,
    //   message: "The deposit for " + parseFloat(payment.amount.amount).toFixed(2).toString() + " is successful",
    //   itemId: payment._id,
    //   itemType: "Payment",
    //   notificationType:"activities"
    // });
    if (addTransaction?.error) {
      return handleError({
        res,
        err: addTransaction.error,
      });
    }
    return handleResponse({
      res,
      msg: messages.PAYMENT_SUCCESS,
      data: payment,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const wirePayment = async (req, res) => {
  try {
    logger.info('Inside wire payment API controller');
    const validation = await wirePaymentRequest(req.body);
    if (validation.error) {
      return handleError({
        res,
        err: validation.message,
      });
    }
    const user = req.user;
    user.bank.forEach((bank) => {
      if (bank._id == req.body.wireId) {
        if (bank.status === 'pending' || bank.status === 'failed') {
          return handleError({
            res,
            err: messages.PAYMENT_METHOD_NOT_VERIFIED,
            statusCode: 422,
          });
        }
      }
    });
    let limitFlag;
    let merchant = false;
    if (req.body?.type === 'merchant') {
      limitFlag = true;
      merchant = true;
    } else {
      limitFlag = await checkLimit(user, req.body, 'Deposit');
    }
    if (limitFlag) {
      req.body.amount.amount = parseFloat(req.body.amount.amount).toFixed(2);
      let trackingRefId;
      let trackingId;
      const docFields = { accountInfo: {} };
      user.bank.forEach((el) => {
        if (el._id == req.body.wireId && el.type === 'wire') {
          trackingRefId = el.trackingRef;
          docFields.accountInfo.id = el.id;
          docFields.accountInfo.description = el.description;
          trackingId = el.id;
        }
      });
      if (trackingRefId === undefined) {
        return handleError({
          res,
          err: messages.TRACKING_REF_NOT_FOUND,
        });
      }
      delete req.body.wireId;

      req.body.trackingRef = trackingRefId;
      req.body.amount.amount = parseFloat(req.body.amount.amount).toFixed(2).toString();
      req.body.trackingId = trackingId;
      const makePayment = await wire_payment(req.body);
      if (makePayment?.error || makePayment?.status === 400) {
        return handleError({
          res,
          err: makePayment?.error || messages.INVALID_DATA,
        });
      }
      const configDoc = await configModel.findOne();
      const payment = await createWirePaymentDoc(
        {
          ...makePayment.data,
          ...docFields,
          merchantPayment: merchant,
        },
        user,
        configDoc,
        'wire'
      );
      // await sendToSocketWebhook('notification', {
      //   _user: user,
      //   message: "The deposit for " + req.body.amount.amount + " is successful",
      //   itemId: payment._id,
      //   itemType: "Payment",
      //   notificationType:"activities"
      // });
      return handleResponse({
        res,
        data: payment,
        msg: messages.PAYMENT_SUCCESS,
      });
    } else {
      return handleError({
        res,
        err: messages.DAILY_TRANSACTION_LIMIT_REACHED,
        statusCode: 400,
      });
    }
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const addCard = async (req, res) => {
  try {
    logger.info('Inside add card API controller');
    req.body.metadata.email = req.user.email;
    const validation = await cardRequest(req.body);
    if (validation.error) {
      return handleError({
        res,
        err: validation.message,
      });
    }
    const user = req.user;
    let userCards = user.cards;

    if (userCards) {
      for (let i = 0; i < userCards.length; i++) {
        let card = await bcrypt.compare(req.body.number, userCards[i].cardNumber);
        if (card) {
          return handleError({
            res,
            err: messages.CARD_EXIST,
          });
        }
      }
    }
    req.body.idempotencyKey = await generateuuid();
    const card = await addCardService(req.body);
    if (card?.error) {
      return handleError({
        res,
        err: card.error,
      });
    }

    req.body.cardId = card.id;
    const encryptedCard = await bcrypt.hash(req.body.number, 10);
    req.body.number = encryptedCard;

    const addToUser = await addCardInfoToUser(user._id, user.userType, req.body);
    if (addToUser?.error) {
      return handleError({
        res,
        err: addToUser.error,
      });
    }
    card._id = addToUser._id;

    await sendToSocketWebhook('notification', {
      _user: user,
      message: 'Card linked to mogul successfully',
      itemId: card._id,
      itemType: 'Card',
      notificationType: 'activities',
    });

    return handleResponse({
      res,
      msg: messages.CARD_SUCCESS,
      data: card,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const payout = async (req, res) => {
  try {
    logger.info('Inside payout API controller');
    const validation = await payoutRequest(req.body);
    if (validation?.error) {
      return handleError({
        res,
        err: validation.message,
      });
    }
    const user = req.user;
    let balance = await getBalance(user.circle.walletId);
    if (balance?.error) {
      return handleError({
        res,
        err: balance.error,
      });
    }
    if (balance.length === 0) balance = 0;
    else balance = balance[0].amount;
    const refEarnings = user.refEarnings ?? 0;
    let achWithdrawBlockedFunds = 0;
    if (user?.userType === 'investor' || user?.userType === 'property_manager') {
      if (user?.achWithdrawBlockedFunds) {
        user?.achWithdrawBlockedFunds.forEach((el) => {
          achWithdrawBlockedFunds += el.amount;
        });
      }
    }

    if (parseFloat(balance) - parseFloat(refEarnings) - parseFloat(achWithdrawBlockedFunds) < parseFloat(req.body.amount.amount)) {
      return handleError({
        res,
        err: messages.INSUFFICIENT_PAYOUT_AMOUNT,
        statusCode: 400,
      });
    }
    const limitFlag = await checkLimit(user, req.body, 'Withdrawal');
    if (!limitFlag) {
      return handleError({
        res,
        err: messages.DAILY_TRANSACTION_LIMIT_REACHED,
        statusCode: 400,
      });
    }
    req.body.idempotencyKey = await generateuuid();
    req.body.source = {
      type: 'wallet',
      id: user.circle.walletId,
    };
    let flag = 0;
    user.bank.forEach((el) => {
      if (el._id == req.body.destination.wireId) {
        req.body.destination.id = el.id;
        flag++;
      }
    });
    if (flag === 0) {
      return handleError({
        res,
        err: messages.INVALID_DATA,
        statusCode: 400,
      });
    }
    delete req.body.destination.wireId;
    const payoutResponse = await createPayout(req.body);
    if (payoutResponse?.error || payoutResponse?.status === 400) {
      await sendToSocketWebhook('notification', {
        _user: user,
        message: 'The withdrawal for ' + req.body.amount.amount + ' has failed',
        itemId: null,
        itemType: 'Payment',
        notificationType: 'activities',
      });
      return handleError({
        res,
        err: payoutResponse?.error || messages.INVALID_DATA,
      });
    }
    const payoutDoc = await createPayoutDoc({ ...payoutResponse.data }, user);
    // await sendToSocketWebhook('notification', {
    //   _user: user,
    //   message: "The withdrawal for " + req.body.amount.amount + " is successful",
    //   itemId: payoutDoc._id,
    //   itemType: "Payment",
    //   notificationType:"activities"
    // });
    return handleResponse({
      res,
      data: payoutDoc,
      msg: messages.PAYOUT_SUCCESS,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const getPromotionDetails = async (req, res) => {
  try {
    logger.info('Inside get promotion details API controller');
    const { promoCode, purchaseProperty } = req.query;
    const result = await getUserPromotionDetails(req.user, promoCode, purchaseProperty);
    if (!result || result.error) {
      return handleError({ res, err: result.error });
    }
    return handleResponse({ res, data: result.data });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const getPromotionAdminDetails = async (req, res) => {
  try {
    logger.info('Inside get promotion admin details API controller');
    const result = await getAdminPromotionDetails(req);
    if (!result || result.error) {
      return handleError({ res, err: result?.error || 'Error fetching promotion details' });
    }
    return handleResponse({ res, data: result });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const getPromotionUserDetails = async (req, res) => {
  try {
    logger.info('Inside get promotion user details API controller');
    const result = await getAdminPromotionUserDetails(req);
    if (!result || result.error) {
      return handleError({ res, err: result?.error || 'Error fetching promotion user details' });
    }
    return handleResponse({ res, data: result });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const updatePromotion = async (req, res) => {
  try {
    logger.info('Inside update promotion API controller');
    const result = await addOrUpdatePromotion(req);
    if (!result || result.error) {
      return handleError({ res, err: result?.error || 'Error updating promotion' });
    }
    return handleResponse({ res, data: result.data });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const getPromotionTransactions = async (req, res) => {
  try {
    logger.info('Inside get promotion transactions API controller');
    const result = await getPromotionTransactionsForUser(req);
    if (!result || result.error) {
      return handleError({ res, err: result?.error || 'Error getting promotion transactions' });
    }
    return handleResponse({ res, data: result });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const getTransaction = async (req, res) => {
  try {
    logger.info('Inside get transaction API controller');
    const user = req.user;
    const result = await getUserTransaction(user, req.query);
    if (result?.error) {
      return handleError({
        res,
        err: result.error,
      });
    }
    return handleResponse({
      res,
      msg: message.TRANSACTION_LIST,
      data: {
        data: result.transaction,
        totalCount: result.totalCount,
      },
      result: result.transaction.length,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const getCards = async (req, res) => {
  try {
    logger.info('Inside get cards API controller');
    const user = req.user;
    const { id } = req.query;
    if (!id) {
      const cards = [];
      const errorStack = [];
      for (let i = 0; i < user.cards.length; i++) {
        let card = await getCardDetails(user.cards[i].cardId);
        if (card.status === 200) {
          cards.push({
            lastFour: card.data.last4,
            cardType: card.data.network,
            expMonth: card.data.expMonth,
            expYear: card.data.expYear,
            status: card.data.status,
            _id: user.cards[i]._id,
            cardId: user.cards[i].cardId,
            accountHolder: card.data.billingDetails.name,
          });
        } else {
          errorStack.push(card);
        }
      }
      return handleResponse({
        res,
        msg: messages.CARDS_LIST,
        data: cards,
      });
    } else {
      const card = await getCardDetails(id);
      if (card.status === 200) {
        return handleResponse({
          res,
          msg: messages.CARD_DETAILS,
          data: card.data,
        });
      } else {
        return handleError({
          res,
          err: card.error.message,
          statuscode: card.status,
        });
      }
    }
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const getDeposits = async (req, res) => {
  try {
    logger.info('Inside get deposits API controller');
    const user = req.user;
    const transaction = await getTransactionByType(user, 'Deposit');
    if (transaction?.error) {
      return handleError({
        res,
        err: transaction.error,
      });
    }
    return handleResponse({
      res,
      msg: message.DEPOSITS_LIST,
      data: transaction,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const unlinkAccounts = async (req, res) => {
  try {
    logger.info('Inside unlink accounts API controller');
    const validation = await unlinkRequest(req.body);
    if (validation?.error) {
      return handleError({
        res,
        err: validation.message,
      });
    }
    const user = req.user;
    const { id, medium } = req.body;
    if (medium === 'bank') {
      let flag = 0;
      user.bank.forEach((el) => {
        if (el.id === id) {
          flag++;
        }
      });
      if (flag === 0) {
        return handleError({
          res,
          err: messages.INVALID_DATA,
          statusCode: 400,
        });
      }
      const requestData = { $pull: { bank: { id: id } } };
      user?.userType === 'admin' ? await updateAdmin(user._id, requestData) : await updateUser(user._id, requestData);
      return handleResponse({ res, msg: messages.BANK_DELETED });
    } else {
      let flag = 0;
      user.cards.forEach((el) => {
        if (el.cardId === id) {
          flag++;
        }
      });
      if (flag === 0) {
        return handleError({
          res,
          err: messages.INVALID_DATA,
          statusCode: 400,
        });
      }
      const requestData = { $pull: { cards: { cardId: id } } };
      user?.userType === 'admin' ? await updateAdmin(user._id, requestData) : await updateUser(user._id, requestData);
      return handleResponse({ res, msg: messages.CARD_DELETED });
    }
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const getWithdrawals = async (req, res) => {
  try {
    logger.info('Inside get withdrawals API controller');
    const user = req.user;
    const transaction = await getTransactionByType(user, 'Withdrawal');
    if (transaction?.error) {
      return handleError({
        res,
        err: transaction.error,
      });
    }
    return handleResponse({
      res,
      msg: message.WITHDRAWALS_LIST,
      data: transaction,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const bankDetails = async (req, res) => {
  try {
    logger.info('Inside bank details API controller');
    const { id } = req.params;
    const user = req.user;
    let flag = 0;
    let details;
    user.bank.forEach((el) => {
      if (el.id === id) {
        details = el;
        flag++;
      }
    });
    if (flag === 0) {
      return handleError({
        res,
        err: messages.INVALID_DATA,
        statusCode: 400,
      });
    }
    let bank = await getBankAccounts(id, details.type);
    bank.data.email = user.email;
    bank.data.mobileNumber = user.countryCode + user.mobileNumber;
    if (bank.status === 200) {
      if (details.type === 'wire') {
        bank.data.accountNumber = details.accountNumber;
      } else {
        bank.data.plaidToken = details?.plaidToken;
      }
      return handleResponse({
        res,
        data: bank.data,
        msg: messages.BANK_DETAILS,
      });
    } else {
      return handleError({
        res,
        err: bank.response.data.message,
      });
    }
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const fees = async (req, res) => {
  try {
    logger.info('Inside fees API controller');
    const feeDetails = await getFees();
    if (feeDetails?.error) {
      return handleError({
        res,
        err: feeDetails.error,
      });
    }
    return handleResponse({
      res,
      msg: messages.CIRCLE_FEE_DETAILS,
      data: feeDetails,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const editCard = async (req, res) => {
  try {
    logger.info('Inside edit Card API controller');
    const validation = await editCardRequest(req.body);
    if (validation.error) {
      return handleError({
        res,
        err: validation.message,
      });
    }
    const cardId = await adminModel.findOne({
      'cards.cardId': req.body.cardId,
    });
    if (!cardId) {
      return handleError({
        res,
        err: messages.CARD_NOT_EXIST,
      });
    }
    const data = {
      cvv: req.body.cvv,
    };
    const encryptCardData = await createEncryptedData(data);

    const requestData = {
      encryptedData: encryptCardData.encryptedMessage,
      keyId: encryptCardData.keyId,
      expMonth: req.body.expMonth,
      expYear: req.body.expYear,
    };
    const updateCard = await updateCircleCard(req.body.cardId, requestData);
    if (updateCard?.error) {
      return handleError({
        res,
        err: updateCard.error,
      });
    }
    return handleResponse({
      res,
      msg: messages.CARD_UPDATE_SUCCESS,
      data: updateCard.data,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const deleteCard = async (req, res) => {
  try {
    logger.info('Inside delete Card API controller');
    const { cardId } = req.body;
    const user = req.user;
    const deleteCard = await deleteCardService(user, cardId);
    return handleResponse({
      res,
      msg: messages.CARD_DELETED,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const createSubscription = async (req, res) => {
  try {
    logger.info('Inside create subscription API controller');
    const { subscribeUrl } = req.body;
    const subscribe = await circle_subscribe({
      endpoint: subscribeUrl,
    });
    if (subscribe?.error) {
      return handleError({
        res,
        err: subscribe.error,
      });
    }
    const fetch = await list_subscription();
    return handleResponse({
      res,
      msg: messages.CIRCLE_SUBSCRIPTION_ADDED,
      data: fetch,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const createtransfer = async (req, res) => {
  try {
    logger.info('Inside create transfer API controller');
    const user = req.user;
    if (user?.userType !== 'admin') {
      return handleError({
        res,
        err: messages.UNAUTHORIZED_TOKEN,
        statusCode: 401,
      });
    }
    let { sourceId, destinationId, amount } = req.body;
    let source;
    let destination;
    let admin = false;
    let sourceUserId;
    let destUserId;

    const isSourceUser = await userModel.findOne({
      _id: ObjectId(sourceId),
    });
    if (!isSourceUser) {
      const isSourceAdmin = await adminModel.findOne({
        _id: ObjectId(sourceId),
      });
      if (!isSourceAdmin)
        return handleError({
          res,
          err: 'Source not found',
        });
      admin = true;
      source = isSourceAdmin?._doc?.circle?.walletId ? isSourceAdmin?._doc?.circle?.walletId : isSourceAdmin?.circle?.walletId;
      sourceUserId = isSourceAdmin._id;
    } else {
      source = isSourceUser?._doc?.circle?.walletId ? isSourceUser?._doc?.circle?.walletId : isSourceUser?.circle?.walletId;
      sourceUserId = isSourceUser._id;
    }
    let balance = await getBalance(source);
    if (balance?.error) {
      return handleError({
        res,
        err: balance.error,
      });
    }
    if (!balance || balance.length === 0) balance = 0;
    else balance = balance[0].amount;
    if (parseFloat(balance) < parseFloat(amount)) {
      return handleError({
        res,
        err: messages.INSUFFICIENT_BALANCE,
      });
    }

    const isDestUser = await userModel.findOne({
      _id: ObjectId(destinationId),
    });
    if (!isDestUser) {
      const isDestAdmin = await adminModel.findOne({
        _id: ObjectId(destinationId),
      });
      if (!isDestAdmin) return handleError({ res, err: 'Destination not found' });
      admin = true;
      destination = isDestAdmin?._doc?.circle.walletId ? isDestAdmin._doc.circle.walletId : isDestAdmin.circle.walletId;
      destUserId = isDestAdmin._id;
    } else {
      destination = isDestUser?._doc?.circle?.walletId ? isDestUser?._doc?.circle?.walletId : isDestUser?.circle?.walletId;
      destUserId = isDestUser._id;
    }

    const idempotencyKey = await generateuuid();
    const request = {
      idempotencyKey: idempotencyKey,
      source: {
        type: 'wallet',
        id: source,
      },
      destination: {
        type: 'wallet',
        id: destination,
      },
      amount: {
        amount: amount,
        currency: 'USD',
      },
    };
    const transfer = await createTransfer(request);
    if (transfer?.error) {
      return handleError({
        res,
        err: transfer.error,
      });
    }

    await transfersModel.create({
      id: transfer.data.id,
      amount: {
        amount: amount,
        currency: 'USD',
      },
      transactionType: 'transfers',
      transferType: 'sent',
      status: 'completed',
      admin,
      userId: sourceUserId,
    });
    await transfersModel.create({
      id: transfer.data.id,
      amount: {
        amount: amount,
        currency: 'USD',
      },
      transactionType: 'transfers',
      transferType: 'received',
      status: 'completed',
      admin,
      userId: destUserId,
    });
    return handleResponse({
      res,
      data: transfer.data,
      msg: messages.TRANSFER_SUCCESS,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const platformTransactions = async (req, res) => {
  try {
    logger.info('Inside platform transaction API controller');
    const user = req.user;
    if (user.userType !== 'admin') {
      return handleError({
        res,
        err: messages.UNAUTHORIZED_TOKEN,
        statusCode: 401,
      });
    }
    const transactions = await getAllTransactions(user, req.query);
    return handleResponse({
      res,
      data: {
        totalCount: transactions.totalCount,
        data: transactions.result,
      },
      result: transactions.resultCount,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const moonpayWidgetURL = async (req, res) => {
  try {
    logger.info('Inside moon pay widget url controller');
    const _user = req.user;
    const url = await createWidgetURL(_user, req.query);
    if (url?.error) return handleError({ res, err: url.error });
    return handleResponse({ res, msg: messages.MOONPAY_WIDGET_URL, data: url });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const paymentTypes = async (req, res) => {
  try {
    logger.info('Inside paymentTypes controller');
    const { userType } = req.user;
    const result = await getPaymentTypes(userType);
    if (result?.error) {
      return handleError({ res, err: result.error });
    }
    return handleResponse({ res, msg: messages.PAYMENT_METHODS, data: result });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const updatePaymentType = async (req, res) => {
  try {
    logger.info('Inside editPaymentTypes controller');
    const validation = await validatePaymentMethod(req.body);
    let dataObj = {};
    if (validation.error) {
      return handleError({ res, err: validation.message });
    }
    const { sanitizedData } = validation;
    dataObj = { ...sanitizedData };
    dataObj.paymentMethodId = req.params.id;
    const updatedPaymentMethod = await updatePaymentMethod(dataObj);
    if (updatedPaymentMethod?.error) {
      return handleError({
        res,
        err: updatedPaymentMethod.error,
        statusCode: updatedPaymentMethod.statusCode,
      });
    }
    return handleResponse({
      res,
      msg: messages.PAYMENT_METHOD_UPDATED,
      data: updatedPaymentMethod,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const withdrawUsdc = async (req, res) => {
  try {
    logger.info('Inside withdraw usdc API controller');
    const user = req.user;
    const { toAddress, qty } = req.body;
    if (!toAddress || !qty) return handleError({ res, err: messages.INVALID_DATA, statusCode: 400 });
    if (!user?.blockchainAddress) return handleError({ res, err: messages.NO_WALLET, statusCode: 400 });
    const balance = await fetchUSDCBalance(user?.blockchainAddress);
    if (balance - user?.blockedReferralFunds < qty) {
      return handleError({ res, err: messages.INSUFFICIENT_PAYOUT_AMOUNT, statusCode: 400 });
    }
    const isAddress = await validateAddress(toAddress);
    if (!isAddress) return handleError({ res, err: messages.INVALID_ADDRESS, statusCode: 400 });
    const transfer = await usdcTransfer(user, toAddress, qty);
    if (transfer?.error) return handleError({ res, err: transfer.error });
    return handleResponse({ res, msg: messages.USDC_TRANSFERED_SUCCESS, data: transfer });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const allWallets = async (req, res) => {
  try {
    logger.info('Inside all Wallets API controller');
    const wallets = await getAllWallets(parseInt(req.query.pageSize));
    if (wallets?.error) return handleError({ res, err: wallets.error });
    return handleResponse({ res, msg: 'All circle wallets', data: wallets });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const sardineWidgetURL = async (req, res) => {
  try {
    logger.info('Inside sardine widget URL API controller');
    const _user = req.user;
    const url = await createSardineWidgetURL(_user);
    if (url?.error) return handleError({ res, err: url.error });
    return handleResponse({ res, msg: messages.SARDINE_WIDGET_URL, data: url });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const stripeOnrampSession = async (req, res, next) => {
  try {
    logger.info('Inside stripe onramp session API controller');
    const session = await createOnrampSession(req.user, req.query);
    if (session?.error) return handleError({ res, err: session.error });
    return handleResponse({ res, msg: messages.STRIPE_ONRAMP_SESSION, data: session });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const transakWidgetURL = async (req, res, next) => {
  try {
    logger.info('Inside transak widget URL API controller');
    const user = req.user;
    const widget = await createTransakURL(user, req.query);
    if (widget?.error) {
      return handleError({ res, err: widget.error });
    }
    return handleResponse({ res, msg: messages.TRANSAK_WIDGET_URL, data: widget });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const exportWallet = async (req, res) => {
  try {
    logger.info('Inside export wallet API controller');
    const user = req.user;
    const { password } = req.body;
    const keyStore = await VenlyHelper.exportVenlyWallet(user.venly, password);
    if (keyStore?.error) return keyStore.error;
    const privateKey = await decryptKey(keyStore.value.keystore, password);
    return handleResponse({ res, msg: messages.EXTRACTED_PRIVATE_KEY, data: privateKey });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const transferRewards = async (req, res) => {
  try {
    logger.info('Inside transfer rewards controller');
    const admin = req.user;
    const userId = req.params.userId;
    const refereeId = req.params.refereeId;
    if (!userId || !refereeId) {
      return handleError({ res, err: messages.INVALID_DATA, statusCode: 400 });
    }
    const user = await getUserDetails(userId);
    if (!user) return handleError({ res, err: messages.INVALID_DATA, statusCode: 400 });

    const referee = await getUserDetails(refereeId);
    if (!referee) return handleError({ res, err: messages.INVALID_DATA, statusCode: 400 });

    const referral = await Referral.findOne({
      referralId: user._id,
      'referee.refereeId': referee._id,
    });
    if (!referral || referral.referee.length === 0 || referral.referralEarnings === 0) {
      return handleResponse({ res, msg: messages.NO_REWARDS_AVAILABLE });
    }
    let rewards = 0;
    let refereeRewards = 0;
    referral.referee.forEach((el) => {
      if (el.refereeId.toString() === refereeId && el?.isAvailed === false && el?.reward > 0 && el?.refereeReward > 0 && el.requiredInvestment === true) {
        rewards += el.reward;
        refereeRewards += el.refereeReward;
      }
    });
    if (rewards === 0 && refereeRewards === 0) return handleResponse({ res, msg: messages.NO_REWARDS_AVAILABLE });

    /* Transfer to referral user */
    if (rewards !== 0) {
      const transfer = await usdcTransfer(admin, user.blockchainAddress, parseFloat(rewards));
      if (transfer?.error) return handleError({ res, msg: transfer.error });
      await userModel.updateOne({ _id: user._id }, { $inc: { blockedReferralFunds: parseFloat(rewards) } });
      await Referral.updateOne({ referralId: user._id, 'referee.refereeId': referee._id }, { $set: { 'referee.$.isAvailed': true } });
      const uuid = await generateuuid();
      await transfersModel.create({
        id: uuid,
        amount: {
          amount: rewards,
          asset: 'USDC',
        },
        quoteCurrencyAmount: rewards,
        transactionType: 'referral',
        transferType: 'received',
        status: 'completed',
        admin: true,
        userId: user._id,
        transactionHash: transfer?.txHash,
        referral: true,
        refereeId: referee._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    /* Transfer to referral user */
    if (refereeRewards !== 0) {
      const transfer = await usdcTransfer(admin, referee.blockchainAddress, parseFloat(refereeRewards));
      if (transfer?.error) return handleError({ res, msg: transfer.error });
      await userModel.updateOne({ _id: referee._id }, { $inc: { blockedReferralFunds: parseFloat(refereeRewards) } });
      await Referral.updateOne({ referralId: user._id, 'referee.refereeId': referee._id }, { $set: { 'referee.$.isAvailed': true } });
      const uuid = await generateuuid();
      await transfersModel.create({
        id: uuid,
        amount: {
          amount: refereeRewards,
          asset: 'USDC',
        },
        quoteCurrencyAmount: refereeRewards,
        transactionType: 'referral',
        transferType: 'received',
        status: 'completed',
        admin: true,
        userId: referee._id,
        transactionHash: transfer?.txHash,
        referralId: user._id,
        referee: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return handleResponse({ res, msg: messages.REWARDS_TRANSFERRED });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const rewardsTransactions = async (req, res) => {
  try {
    logger.info('Inside referral transactions API controller');
    const user = req.user;
    if (user?.userType !== 'admin') {
      return handleError({ res, err: messages.UNAUTHORIZED_TOKEN, statusCode: 400 });
    }
    const txnHistory = await fetchReferralTxn(req?.query);
    if (txnHistory?.error) {
      return handleError({ res, err: txnHistory.error });
    }
    return handleResponse({ res, msg: messages.REFERRAL_TXN_HISTORY, data: txnHistory });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const propertyTransfers = async (req, res) => {
  try {
    logger.info('Inside propertyTransfers controller');
    const { _id: adminId } = req.user;
    const { sourceId, destinationId, amount } = req.body;

    let source;
    let destination;
    let propertyId;
    let propertyName;

    // Check for source
    const isSourceProperty = await PropertyModel.findOne({ _id: ObjectId(sourceId) });
    if (!isSourceProperty) {
      const isSourceAdmin = await adminModel.findOne({ _id: ObjectId(sourceId) }).lean();
      if (!isSourceAdmin) return handleError({ res, err: 'Source not found' });
      source = isSourceAdmin;
    } else {
      if (isSourceProperty?.crowdSale?.status === 'completed') {
        return handleError({ res, err: messages.RESERVES_BALANCE_RESTRICTED, statusCode: 400 });
      }
      source = isSourceProperty;
      propertyId = source._id;
      propertyName = source.otherInfo.title;
    }

    // Fetching source balance
    if (!source.blockchainAddress) return handleError({ res, err: messages.NO_WALLET, statusCode: 400 });
    const sourceBalance = await fetchUSDCBalance(source?.blockchainAddress);
    if (+sourceBalance < +amount) return handleError({ res, err: messages.INSUFFICIENT_PAYOUT_AMOUNT, statusCode: 400 });

    // Check for destination
    const isDestinationProperty = await PropertyModel.findOne({ _id: ObjectId(destinationId) });
    if (!isDestinationProperty) {
      const isDestinationAdmin = await adminModel.findOne({ _id: ObjectId(destinationId) }).lean();
      if (!isDestinationAdmin) return handleError({ res, err: 'Destination not found' });
      destination = isDestinationAdmin;
    } else {
      destination = isDestinationProperty;
      propertyId = destination._id;
      propertyName = destination.otherInfo.title;
    }

    // Create transfer
    const transfer = await usdcTransfer(source, destination.blockchainAddress, parseFloat(amount));
    if (transfer?.error) {
      return handleError({ res, err: transfer.error });
    }

    // Create transfer entry
    const uuid = await generateuuid();
    await transfersModel.create({
      id: uuid,
      amount: {
        amount,
        asset: 'USDC',
      },
      quoteCurrencyAmount: +amount,
      transactionType: 'voluntary',
      transferType: 'received',
      status: 'completed',
      admin: true,
      userId: adminId,
      propertyId,
      propertyName,
      transactionHash: transfer?.txHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return handleResponse({ res, msg: messages.USDC_TRANSFERED_SUCCESS, data: transfer });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const onrampFee = async (req, res) => {
  try {
    logger.info('Inside on ramp fee controller');
    const { amount, currency, quote } = req.params;
    const feeStructure = await fetchMoonpayFee(amount, currency, quote);
    if (feeStructure?.error) return handleError({ res, err: feeStructure.error });
    return handleResponse({ res, data: feeStructure });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const withdrawCredits = async (req, res) => {
  try {
    logger.info('Inside withdraw credits API controller');
    const validation = await withdrawCreditsValidator(req.body);
    if (validation?.error) {
      return handleError({ res, err: validation.message });
    }
    const { credits, bank_id } = req.body;
    const user = req.user;
    const bank = user.bank.filter((el) => el._id.toString() === bank_id)[0];
    if (!bank) return handleError({ res, err: 'Withdrawal Bank not found', statusCode: 400 });

    // Check for credits balance
    if (user.credits + user.rentCredits < credits) return handleError({ res, err: 'Insufficient credits', statusCode: 400 });

    const withdraw = await withdrawCreditsToBank(credits, bank, user);
    if (withdraw?.error) return handleError({ res, err: withdraw.error });
    return handleResponse({ res, msg: 'Withdraw Initiated', data: withdraw });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const manualCheckout = async (req, res) => {
  try {
    logger.info('Inside manual checkout API controller');
    const validation = await manualCheckoutValidator(req.body);
    if (validation?.error) return handleError({ res, err: validation.message });

    const { userId, propertyId, tokens, paymentDetails } = req.body;

    // Fetch user
    const user = await getUserDetails(userId);
    if (!user) return handleError({ res, err: 'No User found' });

    // Check for credits
    if (paymentDetails.credits && user.credits + user.rentCredits < paymentDetails.credits) {
      return handleError({ res, err: 'Insufficient credits', statusCode: 400 });
    }

    // Fetch property details
    const property = await PropertyModel.findOne({ _id: ObjectId(propertyId) });
    if (!property) return handleError({ res, err: 'Property not found' });

    // Check for available tokens
    const tokensAvailable = await tokensAvailableAtSale(ObjectId(propertyId));
    if (!tokensAvailable || tokensAvailable < tokens) {
      return handleError({ res, err: 'Requested tokens are not available at sale', statusCode: 400 });
    }

    // Create a checkout payment doc and make invest API call
    const invest = await checkoutAndTokenTransfer(req.body, user, property);
    if (invest?.error) return handleError({ res, err: invest.error });

    return handleResponse({ res, msg: 'Investment successful', data: invest });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const processBank = async (req, res) => {
  try {
    logger.info('Inside process bank API controller');
    const { bankId } = req.body;
    const user = req.user;
    const bank = user.bank.filter((el) => el._id.toString() === bankId)[0];
    if (!bank) return handleError({ res, err: 'Withdrawal Bank not found', statusCode: 400 });

    if (bank?.brexVendorId && bank?.brexPaymentInstrumentId) return handleResponse({ res, msg: 'Bank processed successfully' });

    // Fetch Bank details from Plaid
    const bankRequest = {
      client_id: (await config.plaid).clientId,
      secret: (await config.plaid).secret,
      access_token: bank.access_token,
    };
    const bankDetails = await plaidRequest('auth/get', bankRequest);
    if (bankDetails?.error) return handleError({ res, err: bankDetails.error });
    let account = bankDetails.accounts;
    account = account.filter((el) => el.account_id === bank.account_id)[0];
    if (!account) return handleError({ res, err: 'No Bank Account Found', statusCode: 400 });
    const { account: accountNumber, routing } = bankDetails.numbers.ach[0];
    const accountType = account.subtype === 'savings' ? 'SAVING' : 'CHECKING';

    // Create user as a vendor in Brex
    const vendorRequest = {
      company_name: user.firstName,
      email: user.email,
      payment_accounts: [
        {
          details: {
            type: 'ACH',
            routing_number: routing,
            account_number: accountNumber,
            account_type: accountType,
            account_class: 'PERSONAL',
            beneficiary_name: account.official_name ?? null,
          },
        },
      ],
    };
    const vendor = await brexPostRequest('vendors', vendorRequest);
    if (vendor?.error) {
      return handleError({ res, err: vendor.error });
    }
    const vendorAccounts = vendor.payment_accounts;
    let paymentInstrumentId;
    vendorAccounts.forEach((el) => {
      if (el.details.type === 'ACH') paymentInstrumentId = el.details.payment_instrument_id;
    });

    // Store vendor Id and payment instrument id in user doc
    await userModel.updateOne({ _id: user._id, 'bank.account_id': bank.account_id }, { 'bank.$.brexVendorId': vendor.id, 'bank.$.brexPaymentInstrumentId': paymentInstrumentId });
    return handleResponse({ res, msg: 'Bank processed successfully', data: vendorRequest });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const addBrexVendor = async (req, res) => {
  try {
    logger.info('Inside add brex vendor API controller');
    const validation = await addVendorValidator(req.body);
    if (validation?.error) return handleError({ res, err: validation.message });
    const data = req.body;
    const addVendorRequest = {
      company_name: data.company_name,
      email: data.email,
      payment_accounts: [
        {
          details: {
            type: 'ACH',
            routing_number: data.accountDetails.routingNumber,
            account_number: data.accountDetails.accountNumber,
            account_type: data.accountDetails.accountType,
            account_class: data.accountDetails.accountClass,
            beneficiary_name: null,
          },
        },
      ],
    };
    const vendor = await brexPostRequest('vendors', addVendorRequest);
    if (vendor?.error) return handleError({ res, err: vendor.error });
    const paymentInstrumentId = vendor?.payment_accounts[0]?.details?.payment_instrument_id;
    if (data?.as === 'MERCURY_LLC' && paymentInstrumentId) {
      await PropertyModel.updateOne({ _id: ObjectId(data.propertyId) }, { $set: { 'financials.brexPaymentInstrumentId': paymentInstrumentId } });
    }
    return handleResponse({ res, msg: 'Brex Vendor', data: vendor });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

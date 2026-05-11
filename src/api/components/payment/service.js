import mongoose from 'mongoose';
import moment from 'moment';
import _ from 'lodash';
import axios from 'axios';
import openpgp from 'openpgp';
import atob from 'atob';
import btoa from 'btoa';
import logger from '../../config/logger.js';
import config from '../../config/config.js';
import db from '../../connections/dbMaster.js';
import { createCard, getPCIPublicKey } from '../../helpers/circle.js';
import userModel from './userModel.js';
import adminModel from './adminModel.js';
import paymentModel from './model.js';
import paymentAdminModel from './paymentAdminModel.js';
import paymentPromotionsModel from './paymentPromotionsModel.js';
import transfersModel from '../payment/transfers.model.js';
import dateFormats from '../../helpers/date.js';
import { exportData } from '../../helpers/exportData.js';
import { sendDatafileEmail } from '../../helpers/sendDataToEmail.js';
import paymentMethod from './paymentMethodModel.js';

import web3Helper from '../../helpers/web3.fireblocks.js';
import { generateuuid } from '../../helpers/helpers.js';
import { addCreditsToReferralUser, makeInvestment } from './stripe.service.js';
import { holdTokensInOrders, holdUserCredits } from './property.service.js';
import { brexWithdrawTransfers, transferFeeToBrexRevenueAccount, transferWithdrawFundsToUser } from './brex.service.js';
import RentBalance from './rentBalance.model.js';
import messages from '../../config/messages.js';
import { updatePromotionValidator } from './validator.js';
import Payment from './model.js';
const configModel = db.collection('config');
const Transaction = db.collection('transaction');
const UserRent = db.collection('userRent');
const Properties = db.collection('property');
const Referral = db.collection('referral');
const Promotions = db.collection('promotions');
const { ObjectId } = mongoose.Types;

export const addWireInfoToUser = async (id, type, requestData) => {
  try {
    logger.info('Inside add wire information to user table service');
    let user;
    requestData.type = 'wire';
    if (type === 'admin') {
      user = await adminModel.findByIdAndUpdate(id, {
        $push: {
          bank: requestData,
        },
      });
    } else {
      user = await userModel.findByIdAndUpdate(id, {
        $push: {
          bank: requestData,
        },
      });
    }

    return user;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const addAchInfoToUser = async (id, type, requestData) => {
  try {
    logger.info('Inside add ACH information to user table service');
    let user;
    if (type === 'admin') {
      user = await adminModel.findByIdAndUpdate(id, {
        $push: {
          bank: {
            type: 'ACH',
            id: requestData.id,
            description: 'ACH Link with Plaid',
            bankType: requestData.bankAccountType,
            plaidToken: requestData.plaidToken,
            plaid_created_at: requestData?.plaid_created_at,
          },
        },
      });
    } else {
      user = await userModel.findByIdAndUpdate(id, {
        $push: {
          bank: {
            type: 'ACH',
            id: requestData.id,
            description: 'ACH Link with Plaid',
            bankType: requestData.bankAccountType,
            plaid_created_at: requestData?.plaid_created_at,
          },
        },
      });
    }

    return user;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const createWirePaymentDoc = async (data, __user, configDoc, type) => {
  logger.info('Inside Create Wire Payment Doc');
  let saveToUser;
  const payment = {
    amount: data.amount,
    status: 'pending',
    transactionType: 'Deposit',
    _user: __user._id,
    accountInfo: {
      medium: type,
      id: data.accountInfo.id,
      description: data.accountInfo.description,
    },
  };
  if (__user.userType === 'admin') {
    payment.merchantPayment = data.merchantPayment;
    saveToUser = await paymentAdminModel.create(payment);
  } else {
    saveToUser = await paymentModel.create(payment);
  }
  return saveToUser;
};

export const createPayoutDoc = async (data, __user) => {
  logger.info('Inside Create Payout Payment Doc');
  let saveToUser;
  const payout = {
    id: data.id,
    amount: data.amount,
    transactionType: 'Withdrawal',
    status: 'pending',
    _user: __user._id,
    isCircleTransferred: true,
    accountInfo: {
      medium: data.destination.type,
      id: data.destination.id,
      description: data.destination.name,
    },
  };
  if (__user.userType === 'admin') {
    saveToUser = await paymentAdminModel.create(payout);
  } else {
    saveToUser = await paymentModel.create(payout);
  }
  return saveToUser;
};

export const addCardService = async (requestData) => {
  try {
    logger.info('Inside add card service');
    const cardData = {
      number: requestData.number,
      cvv: requestData.cvv,
    };
    const encryptCardData = await createEncryptedData(cardData);
    if (encryptCardData.error) {
      return { error: encryptCardData.error };
    }
    requestData.keyId = encryptCardData.keyId;
    requestData.encryptedData = encryptCardData.encryptedMessage;
    const card = await createCard(requestData);
    return card;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const addCardInfoToUser = async (id, type, requestData) => {
  try {
    logger.info('Inside add card info To User service');
    let user;
    if (type === 'admin') {
      user = await adminModel.findByIdAndUpdate(id, {
        $push: {
          cards: {
            cardId: requestData.cardId,
            cardNumber: requestData.number,
          },
        },
      });
    } else {
      user = await userModel.findByIdAndUpdate(id, {
        $push: {
          cards: {
            cardId: requestData.cardId,
            cardNumber: requestData.number,
          },
        },
      });
    }

    return user;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const createEncryptedData = async (requestData) => {
  try {
    logger.info('Inside craete encrypted data service');
    const publicKey = await getPCIPublicKey();
    const decodedPublicKey = await openpgp.readKey({
      armoredKey: atob(publicKey.publicKey),
    });
    const message = await openpgp.createMessage({
      text: JSON.stringify(requestData),
    });

    const encrypted = await openpgp
      .encrypt({
        message,
        encryptionKeys: decodedPublicKey,
      })
      .then((ciphertext) => {
        return {
          encryptedMessage: btoa(ciphertext),
          keyId: publicKey.keyId,
        };
      });
    return encrypted;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const addTransactionToUser = async (id, type, payment, merchant, description = '', circleTransfer = false) => {
  try {
    logger.info('Inside add transaction to user service');
    const transactionDeatils = {
      id: payment.id,
      amount: {
        amount: parseFloat(payment.amount.amount).toFixed(2).toString(),
        currency: payment.amount.currency,
      },
      transactionType: 'Deposit',
      status: payment.status ?? 'pending',
      isCircleTransferred: circleTransfer,
      _user: id,
      accountInfo: {
        medium: payment.source.type,
        id: payment.source.id,
        cardNumber: payment.cardNumber ?? '',
        description,
      },
    };
    let transaction;
    if (type === 'admin') {
      transactionDeatils.merchantPayment = merchant;
      transaction = await paymentAdminModel.create(transactionDeatils);
    } else {
      transaction = await paymentModel.create(transactionDeatils);
    }
    return transaction;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getUserTransaction = async (user, query) => {
  try {
    logger.info('Inside get user transaction service');
    let page = parseInt(query.page) || 1;
    let limit = parseInt(query.limit) || 10;

    const filterObj = {};
    let startFrom;
    if (query.duration) {
      startFrom = dateFormats.subtractDaysInDate(new Date(), +query.duration);
      startFrom = dateFormats.dateToUtcEndDate(startFrom);
      // filterObj.updatedAt = { $gte: startFrom };
    }

    let transaction = [];
    let count;
    let totalCount = 0;
    const admin = user.userType === 'admin' ? true : false;

    // Only allowing crowdsale_success and  marketplace transactionType for transfers
    if (query.transactionType === 'marketplace') {
      filterObj.transactionType = { $in: ['marketplace', 'promotion'] };
    } else if (query.transactionType && ['crowdsale_success', 'rewards', 'conversion'].includes(query.transactionType)) {
      // filterObj.transactionType = admin ? (query?.transactionType !== 'transfers' ? { $regex: query.transactionType ?? '' } : { $regex: '' }) : { $regex: '' };
      filterObj.transactionType = query.transactionType;
    }

    let promiseArr = [
      new Promise((resolve, reject) => {
        transfersModel
          .aggregate([
            {
              $match: {
                // userId: user._id,
                // admin,
                ...filterObj,
              },
            },
            {
              $lookup: {
                from: 'user',
                localField: 'userId',
                foreignField: '_id',
                as: 'userData',
              },
            },
            {
              $group: {
                _id: '$id',
                count: { $count: {} },
                data: {
                  $push: '$$ROOT',
                },
              },
            },
            {
              $match: {
                'data.userId': { $in: [user._id] },
              },
            },
            {
              $project: {
                'data.userData._id': 1,
                'data.userData.firstName': 1,
                'data.amount.amount': 1,
                'data.transactionType': 1,
                'data.transactionHash': 1,
                'data.transferType': 1,
                'data.status': 1,
                'data.propertyId': 1,
                'data.propertyName': 1,
                'data.id': 1,
                'data.admin': 1,
                'data.userId': 1,
                'data.updatedAt': 1,
                'data.createdAt': 1,
                'data.merchant': 1,
                'data.credits': 1,
                count: 1,
              },
            },
          ])
          .then(async (data) => {
            transaction.push(...data);
            resolve(data);
          });
      }),
    ];
    if (admin) {
      promiseArr.push(
        new Promise((resolve, reject) => {
          paymentAdminModel
            .aggregate([
              {
                $match: {
                  // updateAt: filterObj.updatedAt,
                  _user: user._id,
                  transactionType: { $in: ['Checkout', 'Promotion'] },
                  // transactionType: { $regex: query?.transactionType ?? '' },
                },
              },
              {
                $project: {
                  amount: 1,
                  fees: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  transactionType: 1,
                  transactionHash: 1,
                  source: 'Admin',
                  // {
                  //   $cond: {
                  //     if: { $eq: ['$transactionType', 'Deposit'] },
                  //     then: { $ifNull: ['$fromAddress', 'Admin'] },
                  //     else: 'My mogul wallet',
                  //   },
                  // },
                  destination: { $ifNull: ['$propertyName', 'property'] },
                  // {
                  //   $cond: {
                  //     if: { $eq: ['$transactionType', 'Withdrawal'] },
                  //     then: { $ifNull: ['$toAddress', 'Admin'] },
                  //     else: 'My mogul wallet',
                  //   },
                  // },
                  status: 1,
                  accountInfo: 1,
                },
              },
            ])
            .then(async (data) => {
              transaction.push(...data);
              resolve(data);
            });
        })
      );
    } else {
      promiseArr.push(
        new Promise((resolve, reject) => {
          paymentModel
            .aggregate([
              {
                $match: {
                  // updateAt: filterObj.updatedAt,
                  _user: user._id,
                  transactionType: { $in: ['Checkout', 'Promotion', 'Withdrawal'] },
                  // transactionType: { $regex: query.transactionType ?? '' },
                },
              },
              {
                $lookup: {
                  from: 'user',
                  localField: '_user',
                  foreignField: '_id',
                  as: 'userData',
                },
              },
              {
                $unwind: {
                  path: '$userData',
                  preserveNullAndEmptyArrays: true,
                },
              },
              {
                $project: {
                  amount: 1,
                  fees: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  transactionType: 1,
                  transactionHash: 1,
                  source: {
                    $switch: {
                      branches: [
                        { case: { $eq: ['$paymentMethod', 'card'] }, then: 'Card' },
                        { case: { $eq: ['$transactionType', 'Promotion'] }, then: 'mogul' },
                      ],
                      default: 'ACH Bank',
                    },
                  },
                  destination: {
                    $cond: {
                      if: { $eq: ['$transactionType', 'Promotion'] },
                      then: `${user.firstName} ${user.lastName}`,
                      else: { $ifNull: ['$propertyName', 'property'] },
                    },
                  },
                  status: 1,
                  accountInfo: 1,
                },
              },
            ])
            .then(async (data) => {
              transaction.push(...data);
              resolve(data);
            });
        })
      );
    }
    await Promise.allSettled(promiseArr);

    // disabling admin transactionType query filter for transfers
    // if (admin && query?.transactionType === 'transfers') {
    //   transaction = transaction.filter((item) => item?.transactionType !== 'Deposit' || item?.transactionType !== 'Withdrawal');
    // }

    transaction = transaction.map((item) => {
      if (item?.count === 1) {
        const resultObj = {
          id: item.data[0].id,
          amount: item.data[0].amount,
          transactionType: item.data[0].transactionType,
          transferType: item.data[0].transferType,
          transactionHash: item.data[0].transactionHash,
          status: item.data[0].status,
          admin: item.data[0].admin,
          userId: item.data[0].userId,
          updatedAt: item.data[0].updatedAt,
          createdAt: item.data[0].createdAt,
          credits: item.data[0]?.credits ?? 0,
        };
        if (item.data[0].transferType === 'received') {
          resultObj.source = item.data[0].admin && !admin ? 'Admin' : item.data[0].merchant ? 'Merchant' : item?.data[0]?.propertyName ? item?.data[0]?.propertyName : 'Property';
          resultObj.destination = 'mogul';
        } else if (item.data[0].transactionType === 'promotion') {
          resultObj.source = 'mogul';
          resultObj.destination = `${user.firstName} ${user.lastName}`;
        } else {
          resultObj.destination =
            item.data[0].admin && !admin ? 'Admin' : item.data[0].merchant ? 'Merchant' : item?.data[0]?.propertyName ? item?.data[0]?.propertyName : 'Property';
          resultObj.source = 'mogul';
          /* if (item.data[0].transactionType === 'rent') {
            resultObj.source = 'My mogul wallet';
          } */
        }
        return resultObj;
      } else if (item?.count === 2) {
        const resultObj = item.data[0].userId.toString() === user._id.toString() ? item.data[0] : item.data[1];
        if (resultObj.transferType === 'received') {
          resultObj.source = item.data[0]?.userData[0]?.firstName
            ? item.data[0]?.userData[0]?.firstName
            : item.data[0].admin
            ? 'Admin'
            : item.data[0].merchant
            ? 'Merchant'
            : 'Property';
        } else if (item.data[0].transactionType === 'promotion') {
          resultObj.source = 'mogul';
          resultObj.destination = `${user.firstName} ${user.lastName}`;
        } else {
          resultObj.destination = item.data[1]?.userData[0]?.firstName
            ? item.data[1]?.userData[0]?.firstName
            : item.data[1].admin
            ? 'Admin'
            : item.data[1].merchant
            ? 'Merchant'
            : 'Property';
        }
        delete resultObj?.userData;
        return resultObj;
      } else {
        return item;
      }
    });

    /* Fetch Rent Transactions */
    let rentTx = await UserRent.aggregate([
      {
        $match: {
          _user: user._id,
          isUsdcTransferred: true,
        },
      },
      {
        $lookup: {
          from: 'property',
          foreignField: '_id',
          localField: '_property',
          as: 'propertyDetails',
        },
      },
      {
        $unwind: {
          path: '$propertyDetails',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          id: '$_id',
          amount: {
            amount: '$rentReceived',
          },
          transactionType: 'rent',
          transferType: 'received',
          transactionHash: '$transactionHash',
          status: 'completed',
          userId: '$_user',
          updatedAt: 1,
          createdAt: 1,
          source: '$propertyDetails.otherInfo.title',
          destination: 'My mogul wallet',
        },
      },
    ]).toArray();
    rentTx = rentTx.filter((it) => parseFloat(it.amount.amount) > 0);
    transaction.push(...rentTx);

    let resultArr = [];
    const uniqueHash = [...new Set(transaction.map((item) => item.transactionHash))];
    uniqueHash.forEach((item) => {
      let filterArr = transaction.filter((it) => it.transactionHash === item);
      if (filterArr.length === 1 && filterArr[0].transactionType !== 'conversion' && filterArr[0].transactionType !== 'rewards') {
        resultArr.push(filterArr[0]);
        return;
      }
      filterArr = filterArr.filter(
        (it) => it.transactionType !== 'Withdrawal' && it.transactionType !== 'Deposit' && it.transactionType !== 'conversion' && it.transactionType !== 'rewards'
      );
      resultArr.push(...filterArr);
    });
    resultArr = resultArr.map((it) => {
      if (it?.amount?.amount && parseFloat(it.amount.amount) >= 0) {
        return it;
      }
    });
    if (query?.duration) {
      resultArr = resultArr
        .map((item) => {
          if (dateFormats.dateToUtc(item.updatedAt).toISOString() >= startFrom) {
            return item;
          }
        })
        .filter((item) => item);
    }

    if (query?.transactionType) {
      resultArr = resultArr
        .map((item) => {
          if (item?.transactionType === query.transactionType || (query.transactionType === 'marketplace' && item?.transactionType === 'promotion')) {
            return item;
          }
        })
        .filter((item) => item);
    }

    if (query?.search) {
      resultArr = resultArr
        .map((item) => {
          let search = new RegExp(`${query.search}`, 'i');
          if (item?.amount.amount.match(search)) return item;
          if (item?.destination.match(search)) return item;
          if (item?.source.match(search)) return item;
        })
        .filter((item) => item);
    }

    /* let resultArr = [];
    const uniqueHash = [...new Set(transaction.map((item) => item.transactionHash))];
    uniqueHash.forEach((item) => {
      let filterArr = transaction.filter((it) => it.transactionHash === item);
      if (filterArr.length === 1) {
        resultArr.push(filterArr[0]);
        return;
      }
      filterArr = filterArr.filter((it) => it.transactionType !== 'Withdrawal' && it.transactionType !== 'Deposit');
      resultArr.push(...filterArr);
    }); */

    totalCount = resultArr.length;
    resultArr = resultArr.sort((a, b) => b.createdAt - a.createdAt).slice((page - 1) * limit, (page - 1) * limit + limit);
    count = resultArr.length;
    return { totalCount, transaction: resultArr, count };
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const updateUser = async (id, requestData) => {
  try {
    logger.info('Inside update user service');
    const user = await userModel.findByIdAndUpdate(id, requestData);
    return user;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getTransactionByType = async (user, type) => {
  try {
    logger.info('Inside get transaction by type service');
    let transaction;
    if (user.userType === 'admin') {
      transaction = await paymentAdminModel.find({
        _user: user._id,
        transactionType: type,
      });
    } else {
      transaction = await paymentModel.find({
        _user: user._id,
        transactionType: type,
      });
    }
    return transaction;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const updateAdmin = async (id, requestData) => {
  try {
    logger.info('Inside update user service');
    const user = await adminModel.findByIdAndUpdate(id, requestData);
    return user;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getFees = async () => {
  try {
    logger.info('Inside get fees service');
    let fee = configModel.find({});
    fee = await fee.toArray();
    return fee;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const deleteCardService = async (user, cardId) => {
  try {
    logger.info('Inside delete card service');
    let card;
    if (user.userType === 'admin') {
      card = await adminModel.findByIdAndUpdate({ _id: user._id }, { $pull: { cards: { cardId } } }, { safe: true, multi: false });
    } else {
      card = await userModel.findByIdAndUpdate({ _id: user._id }, { $pull: { cards: { cardId } } }, { safe: true, multi: false });
    }
    return card;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getAllTransactions = async (user, query) => {
  try {
    logger.info('Inside get all transactions service');
    let page = parseInt(query?.page) || 1;
    let limit = parseInt(query?.limit) || 10;
    let filters = [];
    if (query.startDate && query.endDate) {
      query.startDate = dateFormats.dateToUtcStartDate(query.startDate);
      query.endDate = dateFormats.dateToUtcEndDate(query.endDate);
      filters.push({
        createdAt: {
          $gte: new Date(query.startDate),
          $lte: new Date(query.endDate),
        },
      });
    }

    const statusObj = {};
    if (query.status) {
      statusObj.$or = [];
      query.status = query.status.split(',');
      // query.status.map((el) => {
      //   if (['completed', 'paid', 'complete'].includes(el)) {
      //     statusObj.$or.push({ status: 'completed' }, { status: 'paid' }, { status: 'complete' });
      //   }
      //   statusObj.$or.push({ status: el });
      // });
      filters.push({ status:{
        $in: query.status
      } });
    }

    let result = [];
    const filterQuery = filters.length === 0 ? {} : filters.length === 1 ? filters[0] : { $and: filters };

    let userPayment = await paymentModel.aggregate([
      {
        $match: { ...filterQuery, transactionType: { $in: ['Checkout'] } },
      },
      {
        $lookup: {
          from: 'user',
          localField: '_user',
          foreignField: '_id',
          as: 'userData',
        },
      },
      {
        $unwind: {
          path: '$userData',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          amount: '$amount.amount',
          transactionType: 1,
          status: 1,
          updatedAt: 1,
          id: 1,
          transactionHash: '$_id',
          source: '$userData.firstName',
          // {
          // $cond: {
          //   if: { $eq: ['$transactionType', 'Deposit'] },
          //   then: '$fromAddress',
          //   else: '$userData.firstName',
          // },
          // },
          destination: '$propertyName',
          // {
          //   $cond: {
          //     if: { $eq: ['$transactionType', 'Deposit'] },
          //     then: '$userData.firstName',
          //     else: '$toAddress',
          //   },
          // },
        },
      },
    ]);

    let adminPayment = await paymentAdminModel.aggregate([
      {
        $match: { ...filterQuery, transactionType: { $in: ['Checkout'] } },
      },
      {
        $project: {
          _id: 1,
          amount: '$amount.amount',
          transactionType: 1,
          status: 1,
          updatedAt: 1,
          id: 1,
          transactionHash: '$_id',
          source: 'Admin',
          // {
          //   $cond: {
          //     if: { $eq: ['$transactionType', 'Deposit'] },
          //     then: '$fromAddress',
          //     else: 'Admin',
          //   },
          // },
          destination: '$propertyName',
          //   {
          //     $cond: {
          //       if: { $eq: ['$transactionType', 'Deposit'] },
          //       then: 'Admin',
          //       else: '$toAddress',
          //     },
          //   },
        },
      },
    ]);

    let transfers = await transfersModel.aggregate([
      {
        $match: { ...filterQuery, transactionType: { $in: ['marketplace'] } }, // Only fetching marketplace txn types.to fetch all comment this line and uncomment below line
        // $match: filterQuery,
      },
      {
        $lookup: {
          from: 'user',
          localField: 'userId',
          foreignField: '_id',
          as: 'userData',
        },
      },
      {
        $group: {
          _id: '$id',
          count: { $count: {} },
          data: {
            $push: '$$ROOT',
          },
        },
      },
      {
        $project: {
          'data._id': 1,
          'data.userData._id': 1,
          'data.userData.firstName': 1,
          'data.amount.amount': 1,
          'data.transactionType': 1,
          'data.transferType': 1,
          'data.transactionHash': 1,
          'data.status': 1,
          'data.propertyId': 1,
          'data.propertyName': 1,
          'data.id': 1,
          'data.admin': 1,
          'data.userId': 1,
          'data.updatedAt': 1,
          count: 1,
        },
      },
    ]);

    transfers = transfers.map((item) => {
      if (item.count === 2) {
        const resultObj = {
          _id: item.data[0]._id,
          id: item.data[0].id,
          amount: item.data[0].amount.amount,
          transactionType: item.data[0].transactionType,
          status: item.data[0].status,
          updatedAt: item.data[0].updatedAt,
          source: item.data[0]?.userData[0]?.firstName || (item.data[0].admin ? 'Admin' : item.data[0]?.propertyName),
          destination: item.data[1]?.userData[0]?.firstName || (item.data[1].admin ? 'Admin' : item.data[1]?.propertyName),
          transactionHash: item?.data[0]?.transactionHash,
        };
        return resultObj;
      } else {
        const resultObj = {
          _id: item.data[0]._id,
          id: item.data[0].id,
          amount: item.data[0].amount.amount,
          transactionType: item.data[0].transactionType,
          status: item.data[0].status,
          updatedAt: item.data[0].updatedAt,
          transactionHash: item?.data[0]?.transactionHash,
        };
        if (item.data[0].transferType === 'sent') {
          resultObj.source = item.data[0]?.userData[0]?.firstName ? item.data[0]?.userData[0]?.firstName : item.data[0].admin ? 'Admin' : item.data[0]?.propertyName;
          resultObj.destination = item.data[0]?.propertyName || 'merchant';
        }

        if (item.data[0].transferType === 'received') {
          resultObj.source = item.data[0]?.propertyName || 'merchant';
          resultObj.destination = item.data[0]?.userData[0]?.firstName ? item.data[0]?.userData[0]?.firstName : item.data[0].admin ? 'Admin' : item.data[0]?.propertyName;
        }
        return resultObj;
      }
    });

    let transaction = await Transaction.aggregate([
      {
        $match: filterQuery,
      },
      {
        $lookup: {
          from: 'property',
          foreignField: '_id',
          localField: 'propertyId',
          as: 'propertyData',
        },
      },
      {
        $unwind: {
          path: '$propertyData',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'user',
          foreignField: '_id',
          localField: 'propertyData.otherInfo._manager',
          as: 'managerData',
        },
      },
      {
        $unwind: {
          path: '$managerData',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          amount: 1,
          updatedAt: 1,
          id: 1,
          type: 1,
          propertyName: '$propertyData.otherInfo.title',
          propertyManager: '$managerData.firstName',
          companyName: '$managerData.companyName',
        },
      },
    ]).toArray();

    transaction = transaction
      .filter((it) => it.amount)
      .map((item) => {
        const resultObj = {
          id: item?.id,
          amount: item.amount,
          transactionType: 'Transaction',
          status: 'completed',
          updatedAt: item.updatedAt,
          source: item.propertyName + ` (${item.type})`,
          destination: item.propertyManager + ` (${item.companyName})`,
        };
        return resultObj;
      });

    result.push(...userPayment, ...adminPayment, ...transaction, ...transfers);

    result = result
      .map((item) => {
        if (item.status === 'paid' || item.status === 'complete') {
          item.status = 'completed';
          return item;
        }
        return item;
      })
      .filter((item) => item);

    if (query.txnType) {
      query.txnType = query.txnType.split(',');
      result = result
        .map((item) => {
          if (query.txnType.includes(item.transactionType)) return item;
        })
        .filter((item) => item);
    }

    if (query?.search) {
      result = result
        .map((item) => {
          let search = new RegExp(`${query.search}`, 'i');
          if (item?.source.match(search)) return item;
          if (item?.destination.match(search)) return item;
        })
        .filter((item) => item);
    }

    // const uniqueHash = [...new Set(result.map((item) => item.transactionHash))];
    // result = uniqueHash.map((item) => {
    //   const filteredArr = result.filter((it) => it.transactionHash === item);
    //   const finalArr = filteredArr.filter((it) => it.transactionType !== 'Withdrawal');
    //   if (finalArr.length) {
    //     return finalArr[0];
    //   } else {
    //     return filteredArr[0];
    //   }
    // });

    let resultArr = [];
    const uniqueHash = [...new Set(result.map((item) => item.transactionHash))];
    uniqueHash.forEach((item) => {
      let filterArr = result.filter((it) => it.transactionHash === item);
      if (filterArr.length === 1 && filterArr[0].transactionType !== 'conversion' && filterArr[0].transactionType !== 'rewards') {
        resultArr.push(filterArr[0]);
        return;
      }
      filterArr = filterArr.filter(
        (it) => it.transactionType !== 'Withdrawal' && it.transactionType !== 'Deposit' && it.transactionType !== 'conversion' && it.transactionType !== 'rewards'
      );
      resultArr.push(...filterArr);
    });
    const totalCount = resultArr.length;

    // Sorting by price if given else by updatedAt
    let sortBy;
    if (query.sortBy === 'price') {
      if (+query.sortKey == 1) {
        sortBy = (a, b) => parseFloat(a.amount) - parseFloat(b.amount);
      } else if (+query.sortKey == -1) sortBy = (a, b) => parseFloat(b.amount) - parseFloat(a.amount);
    }
    if (!query.sortBy) {
      sortBy = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt);
    }

    resultArr = resultArr.sort((a, b) => sortBy(a, b)).slice((page - 1) * limit, (page - 1) * limit + limit);

    if (query.sendData && result.length > 0 && ['toCsv', 'toXls'].includes(query.sendData)) {
      const type = query.sendData;
      const resultData = resultArr
        .map((item) => {
          const resultObj = {
            date: dateFormats.toLocalFormat(item.updatedAt),
            txnType: item.transactionType,
            source: item.source,
            destination: item.destination,
            amount: `$${item.amount}`,
            status: item.status,
          };
          return resultObj;
        })
        .filter((item) => item);

      const fileName = `All-Platform-transaction-${user.name || 'data'}-admin`;
      const createData = await exportData({
        resultData,
        fileName,
        type,
      });
      if (createData?.error) return { error: createData.error };
      await sendDatafileEmail(user.email, type, fileName);
    }

    const resultCount = resultArr.length;
    return { result: resultArr, totalCount, resultCount };
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getUserDetails = async (userId) => {
  try {
    logger.info('Inside get user details service');
    const user = await userModel.findById(ObjectId(userId)).lean();
    return user;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getPaymentTypes = async (userType) => {
  try {
    logger.info('Inside getPaymentTypes service');
    if (userType === 'admin') {
      const paymentTypes = await paymentMethod.find().sort({ createdAt: -1 }).lean();
      return paymentTypes;
    }
    const paymentTypes = await paymentMethod.find({ isHidden: false }).sort({ createdAt: -1 }).lean();
    return paymentTypes;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const updatePaymentMethod = async (dataObj) => {
  try {
    logger.info('Inside updatePaymentMethod service');
    const typeExist = await paymentMethod.findById({
      _id: ObjectId(dataObj.paymentMethodId),
    });
    if (!typeExist) {
      logger.error('Invalid Id for for payment method');
      return { error: 'This payment methods does not exist!', statusCode: 400 };
    }
    if (dataObj?.platform && dataObj.platform.length > 0) {
      dataObj.platform.forEach((el) => {
        el.updatedAt = dateFormats.getCurrentDateTime();
      });
    }
    const paymentTypes = await paymentMethod.findByIdAndUpdate(ObjectId(dataObj.paymentMethodId), { $set: dataObj }, { new: true });
    return paymentTypes;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const usdcTransfer = async (user, toAddress, qty) => {
  try {
    logger.info('Inside usdc transfer service');

    const priceInWei = web3Helper.strToUSDCConvert(qty);
    const transfer = await web3Helper.ExecuteMethod('SEND', web3Helper.contracts.Usdc, 'transfer', [toAddress, priceInWei]);
    if (transfer?.error) {
      return { error: transfer.error };
    }
    return transfer;
    return { error: 'error usdc transfer' };
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const validateAddress = async (address) => {
  try {
    logger.info('Inside validate address service');

    const isAddress = await web3Helper.validateAddress(address);
    return isAddress;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const createOnrampSession = async (user, request) => {
  try {
    logger.info('Inside create onramp session service');
    user.email = encodeURIComponent(user.email);
    let filters = `transaction_details[wallet_addresses][polygon]=${user.blockchainAddress}&transaction_details[source_currency]=usd&transaction_details[destination_currency]=usdc&transaction_details[destination_network]=polygon&transaction_details[lock_wallet_address]=true`;
    if (request?.directInvest && request?.directInvest === 'true') {
      if (parseFloat(request?.baseAmount) < 1) {
        request.baseAmount = 1;
      }
      filters = filters + `&transaction_details[destination_exchange_amount]=${request?.baseAmount}`;
    }
    let kycData;
    if (user?.kycInquiryId && user?.kycInquiryId !== '') {
      const inquiry = await getInquiry(user?.kycInquiryId);
      kycData = inquiry?.data?.data?.attributes;
    }
    if (kycData && kycData !== undefined) {
      const inquiry = await getInquiry(user?.kycInquiryId);
      const kycData = inquiry?.data?.data?.attributes;
      let birthMonth = moment(kycData?.birthdate).add(1, 'month').month();
      if (birthMonth === 0) {
        birthMonth = 12;
      }
      filters =
        filters +
        `&customer_information[email]=${user?.email}&customer_information[first_name]=${kycData['name-first']}&customer_information[last_name]=${
          kycData['name-last']
        }&customer_information[dob][year]=${moment(kycData?.birthdate).year()}&customer_information[dob][month]=${birthMonth}&customer_information[dob][day]=${moment(
          kycData?.birthdate
        ).date()}&customer_information[address][country]=${kycData.fields['address-country-code']['value']}&customer_information[address][line1]=${
          kycData['address-street-1']
        }&customer_information[address][city]=${kycData['address-city']}&customer_information[address][state]=${
          kycData['address-subdivision-abbr']
        }&customer_information[address][postal_code]=${kycData['address-postal-code-abbr']}`;
    } else {
      let birthMonth = moment(user?.dob).add(1, 'month').month();
      if (birthMonth === 0) {
        birthMonth = 12;
      }
      filters =
        filters +
        `&customer_information[email]=${user?.email}&customer_information[first_name]=${user?.firstName ?? user?.name}&customer_information[last_name]=${
          user?.lastName
        }&customer_information[dob][year]=${moment(user?.dob).year()}&customer_information[dob][month]=${birthMonth}&customer_information[dob][day]=${moment(
          user?.dob
        ).date()}&customer_information[address][country]=${user?.countryISO2}&customer_information[address][line1]=${user?.address1}&customer_information[address][city]=${
          user?.city
        }&customer_information[address][state]=${user?.stateCode}&customer_information[address][postal_code]=${user?.zipCode}`;
    }
    const session = await axios.post((await config.stripe).onrampSession.url, filters, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: {
        username: (await config.stripe).secretKey,
      },
    });
    if (session?.error) return { error: session.error };
    const { data } = session;
    return data;
  } catch (err) {
    logger.error(err);
    return { error: err?.response?.data?.error?.message ?? err.message };
  }
};

export const decryptKey = async (keyStore, password) => {
  try {
    logger.info('Inside decrypt key service');

    const result = await web3Helper.decryptKeyStore(keyStore, password);
    return result;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getInquiry = async (inquiryId) => {
  try {
    logger.info('Inside get Inquiry service');
    const inquiry = await axios.get(`${(await config.persona).url}/api/v1/inquiries/${inquiryId}`, {
      headers: {
        Authorization: 'Bearer ' + `${(await config.persona).apiKey}`,
      },
    });
    if (inquiry?.error) return { error: inquiry.error };
    return inquiry;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const fetchReferralTxn = async (query) => {
  try {
    logger.info('Inside fetch referral txn service');
    const page = parseInt(query?.page) || 1;
    const limit = parseInt(query?.limit) || 10;
    const search = query?.search;
    let startDate = query?.startDate;
    let endDate = query?.endDate;

    const requestQuery = {
      $match: {
        transactionType: 'marketplace',
        credits: { $gt: 0 },
      },
    };

    if (startDate && endDate) {
      startDate = new Date(startDate);
      startDate.setUTCHours(0, 0, 0, 0);
      endDate = new Date(endDate);
      endDate.setUTCHours(23, 59, 59, 999);
      requestQuery.$match.$and = [
        {
          createdAt: { $gte: startDate },
        },
        {
          createdAt: { $lt: endDate },
        },
      ];
    }

    let transactions = await transfersModel.aggregate([
      requestQuery,
      {
        $lookup: {
          from: 'user',
          foreignField: '_id',
          localField: 'userId',
          as: 'userDetails',
        },
      },
      {
        $unwind: {
          path: '$userDetails',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $project: {
          transactionHash: 1,
          amount: 1,
          quoteCurrencyAmount: 1,
          transactionType: 1,
          transferType: 1,
          status: 1,
          createdAt: 1,
          userName: '$userDetails.firstName',
          credits: 1,
        },
      },
    ]);

    if (search && search !== '') {
      transactions = transactions
        .map((item) => {
          let regex = new RegExp(`${search}`, 'i');
          if (item?.userName && item?.userName.match(regex)) return item;
        })
        .filter((item) => item);
    }
    const totalCount = transactions.length;
    transactions = transactions.slice((page - 1) * limit, (page - 1) * limit + limit);
    return { totalCount, transactions };
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const fetchMoonpayFee = async (amount, currency, quote) => {
  try {
    const publishableKey = (await config.moonpay).publishableKey;
    const response = await axios.get(
      `https://api.moonpay.com/v3/currencies/${quote}/buy_quote/?apiKey=${publishableKey}&baseCurrencyAmount=${amount}&baseCurrencyCode=${currency}`
    );
    if (response?.error) return { error: response.error };
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const withdrawCreditsToBank = async (credits, bank, user) => {
  try {
    logger.info('Inside withdraw credits to bank service');
    let processingFee = 0;
    let totalCredits = credits;

    let IRCredits = 0;
    let rentCredits = 0;

    if (user.credits > credits) {
      IRCredits = credits;
    } else {
      IRCredits = user.credits;
      rentCredits = credits - IRCredits;
    }

    // Hold credits
    let updatedCredits = parseFloat((user.credits - IRCredits).toFixed(2));
    let updatedRentCredits = parseFloat((user.rentCredits - rentCredits).toFixed(2));
    let updatedCreditsOnHold = parseFloat((user.creditsOnHold + IRCredits).toFixed(2));
    let updatedRentCreditsOnHold = parseFloat((user.rentCreditsOnHold + rentCredits).toFixed(2));
    await userModel.updateOne(
      { _id: user._id },
      { credits: updatedCredits, creditsOnHold: updatedCreditsOnHold, rentCredits: updatedRentCredits, rentCreditsOnHold: updatedRentCreditsOnHold }
    );

    // Check for affiliate status
    const referral = await Referral.findOne({ referralId: user._id });
    if (referral?.affiliate) {
      const today = new Date();
      const withdrawPayment = await paymentModel.findOne({
        _user: user._id,
        transactionType: 'Withdrawal',
        createdAt: { $gte: new Date(today.getFullYear(), today.getMonth(), 1), $lt: new Date(today.getFullYear(), today.getMonth() + 1, 0) },
      });
      if (withdrawPayment) processingFee = await config.processingFee;
    } else {
      processingFee = await config.processingFee;
    }

    // Make withraw record in transfers table
    const paymentRequest = {
      amount: {
        amount: totalCredits,
      },
      fees: {
        amount: processingFee,
      },
      transactionType: 'Withdrawal',
      status: 'pending',
      _user: user._id,
      bankAccountId: bank._id,
      withdrawRequestedIRCredits: IRCredits,
      withdrawRequestedIRCreditsSettled: 0,
      withdrawRequestedRentCredits: rentCredits,
      withdrawRequestedRentCreditsSettled: 0,
      brexVendorId: bank?.brexVendorId,
      brexPaymentInstrumentId: bank?.brexPaymentInstrumentId,
    };
    const payment = await paymentModel.create(paymentRequest);

    const BrexRentAccountId = (await config.brex).rentAccountId;
    const BrexSweepAccountId = (await config.brex).sweepAccountId;
    if (IRCredits > 0) {
      // Make Brex transfer from Brex sweep to Brex rent account
      const IRTransfer = await brexWithdrawTransfers(IRCredits, `IR Credits transfer for ${payment._id}`, BrexRentAccountId, BrexSweepAccountId);
      if (IRTransfer?.error) {
        payment.withdrawnIRCredits = {
          credits: IRCredits,
          status: 'failed',
          failureReason: IRTransfer.error,
        };
      } else {
        payment.withdrawnIRCredits = {
          credits: IRCredits,
          transferId: IRTransfer?.id,
          status: 'processing',
        };
      }
      await payment.save();
    }

    if (rentCredits > 0) {
      const rentBalance = await RentBalance.aggregate([
        {
          $match: {
            _user: user._id,
          },
        },
        {
          $sort: {
            rentCredits: 1,
          },
        },
        {
          $lookup: {
            from: 'property',
            foreignField: '_id',
            localField: '_property',
            as: 'propertyDetails',
          },
        },
        {
          $unwind: {
            path: '$propertyDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            _property: 1,
            _user: 1,
            rentCredits: 1,
            rentCreditsOnHold: 1,
            mercuryToken: '$propertyDetails.financials.mercuryToken',
            mercuryRentAccountUuid: '$propertyDetails.financials.mercuryRentAccountUuid', // Add this field in property doc
            brexRentAccountRecipientId: '$propertyDetails.financials.brexRentAccountRecipientId', // Create recipient and ddd this field in property doc
          },
        },
      ]);

      let mercuryTransfers = [];
      let rentCreditsCount = rentCredits;
      rentBalance.forEach((el) => {
        if (rentCreditsCount > 0) {
          if (el.rentCredits < rentCreditsCount) {
            rentCreditsCount = rentCreditsCount - el.rentCredits;
            mercuryTransfers.push({
              _property: el._property,
              rentCredits: el.rentCredits,
              mercuryToken: el.mercuryToken,
              rentBalanceId: el._id,
              mercuryRentAccountUuid: el?.mercuryRentAccountUuid,
              brexRentAccountRecipientId: el?.brexRentAccountRecipientId,
              status: 'batch',
            });
          } else {
            mercuryTransfers.push({
              _property: el._property,
              rentCredits: rentCreditsCount,
              mercuryToken: el?.mercuryToken,
              rentBalanceId: el._id,
              mercuryRentAccountUuid: el?.mercuryRentAccountUuid,
              brexRentAccountRecipientId: el?.brexRentAccountRecipientId,
              status: 'batch',
            });
            rentCreditsCount = 0;
          }
        }
      });

      let promises = [];
      // Update withdrawn rent credits to batch status for cron to pick up
      for await (const transfer of mercuryTransfers) {
        await Payment.updateOne(
          { _id: payment._id },
          {
            $push: {
              withdrawnRentCredits: {
                rentBalanceId: transfer.rentBalanceId,
                propertyId: transfer._property,
                rentCredits: transfer.rentCredits,
                status: 'batch',
              },
            },
          }
        );
      }
      await Promise.allSettled(promises);
    }

    // Check the payment Doc, unblock/unhold credits for any failed transfers
    const updatedPayment = await paymentModel.findOne({ _id: payment._id });
    if (updatedPayment?.withdrawnIRCredits?.status === 'failed') {
      updatedCredits = parseFloat((updatedCredits + updatedPayment.withdrawnIRCredits.credits).toFixed(2));
      updatedCreditsOnHold = parseFloat((updatedCreditsOnHold - updatedPayment.withdrawnIRCredits.credits).toFixed(2));
      updatedPayment.withdrawRequestedIRCredits = updatedPayment.withdrawRequestedIRCredits - updatedPayment.withdrawnIRCredits.credits;
    }
    await updatedPayment.save();
    let failedCredits = 0;
    for (let transfer of updatedPayment.withdrawnRentCredits) {
      if (transfer?.status === 'failed') {
        failedCredits += transfer.rentCredits;
      }
    }
    updatedRentCredits = parseFloat((updatedRentCredits + failedCredits).toFixed(2));
    updatedRentCreditsOnHold = parseFloat((updatedRentCreditsOnHold - failedCredits).toFixed(2));
    updatedPayment.withdrawRequestedRentCredits = updatedPayment.withdrawRequestedRentCredits - failedCredits;
    await updatedPayment.save();
    await userModel.updateOne(
      { _id: user._id },
      { credits: updatedCredits, creditsOnHold: updatedCreditsOnHold, rentCredits: updatedRentCredits, rentCreditsOnHold: updatedRentCreditsOnHold }
    );
    if (updatedPayment.credits === 0 && updatedPayment.rentCredits === 0) {
      updatedPayment.status = 'failed';
      await updatedPayment.save();
    }
    return updatedPayment;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const checkoutAndTokenTransfer = async (data, user, property) => {
  try {
    logger.info('Inside checkout and token transfer service');
    const { credits, amount, bankAccountId, transactionId } = data.paymentDetails;

    let rentCreditsToHold = 0;
    let creditsToHold = 0;
    /* Check user credits */
    if (credits > 0) {
      if (user.credits + user.rentCredits < credits) {
        return { error: 'Insufficient credits' };
      }
      if (user.credits > credits) {
        creditsToHold = credits;
        rentCreditsToHold = 0;
      } else {
        if (user.credits > 0) {
          creditsToHold = user.credits;
          rentCreditsToHold = credits - creditsToHold;
        } else {
          creditsToHold = 0;
          rentCreditsToHold = credits;
        }
      }
    }
    let paymentObject = {};
    // Create a checkout payment doc
    if (parseFloat(amount) > 0) {
      const fee = await config.processingFee;
      paymentObject = {
        id: transactionId ?? (await generateuuid()),
        amount: { amount: amount },
        quoteCurrencyAmount: amount,
        fees: { amount: fee }, // Will Fee be charged same? $3.99?
        transactionType: 'Checkout',
        status: 'succeeded',
        bankAccountId: bankAccountId,
        _user: user._id,
        paymentMethod: 'wire_transfer',
        propertyId: property._id,
        propertyName: property.otherInfo.title,
        holdTokens: data.tokens,
        holdCredits: { credits: creditsToHold, rentCredits: rentCreditsToHold },
        investmentStatus: 'pending',
        plaidSweepStatus: 'swept_settled',
        affiliate: false,
      };

      // Referral Link Changes
      const referral = await Referral.findOne({ 'referee.refereeId': user._id });
      if (referral && referral.affiliate) {
        let referee;
        referral.referee.forEach((it) => {
          if (it.refereeId.toString() === user._id.toString()) referee = it;
        });
        if (referee) {
          let refereeInvestmentInTimer = referee.amountInvestedInTimer;
          if (!referee.timer) {
            refereeInvestmentInTimer = parseFloat((refereeInvestmentInTimer + (parseFloat(paymentObject.amount.amount) - parseFloat(paymentObject.fees.amount))).toFixed(2));
            await Referral.updateOne({ 'referee.refereeId': user._id }, { $set: { 'referee.$.timer': new Date(), 'referee.$.amountInvestedInTimer': refereeInvestmentInTimer } });
            paymentObject.affiliate = true;
          } else {
            if (moment(referee.timer).add(1, 'day') > new Date()) {
              refereeInvestmentInTimer = parseFloat((refereeInvestmentInTimer + (parseFloat(paymentObject.amount.amount) - parseFloat(paymentObject.fees.amount))).toFixed(2));
              await Referral.updateOne({ 'referee.refereeId': user._id }, { $set: { 'referee.$.amountInvestedInTimer': refereeInvestmentInTimer } });
              paymentObject.affiliate = true;
            }
          }
        }
      }
    } else {
      paymentObject = {
        id: await generateuuid(),
        amount: { amount: 0 },
        quoteCurrencyAmount: 0,
        fees: { amount: 0 }, // Will Fee be charged same? $3.99?
        transactionType: 'Checkout',
        status: 'succeeded',
        bankAccountId: bankAccountId,
        _user: user._id,
        paymentMethod: 'wire_transfer',
        propertyId: property._id,
        propertyName: property.otherInfo.title,
        holdTokens: data.tokens,
        holdCredits: { credits: creditsToHold, rentCredits: rentCreditsToHold },
        investmentStatus: 'pending',
        plaidSweepStatus: 'swept_settled',
        affiliate: false, // Need confirmation, will non-US investors have referral
      };
    }
    // Hold tokens
    const holdOrders = await holdTokensInOrders(data.tokens, property._id);
    // Hold Credits
    if (credits > 0) {
      await holdUserCredits(creditsToHold, rentCreditsToHold, user._id);
    }
    paymentObject.holdOrders = holdOrders;
    const payment = await paymentModel.create(paymentObject);
    // Make an invest API call
    await makeInvestment(payment);

    // Add Referral Credits
    if (payment?.affiliate) await addCreditsToReferralUser(payment._id);
    return payment;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const withdrawalFailedStatusCheck = async (paymentId) => {
  try {
    logger.info('Inside status check and fund transfer service');
    const payment = await paymentModel.findOne({ _id: paymentId });
    if (!payment) return;

    let statusFlag = false;
    // Check for withdrawal IR credits status
    if (withdrawnIRCredits.status !== 'failed') statusFlag = true;

    // Check for withdrawal rent credits status
    payment.withdrawnRentCredits.forEach((el) => {
      if (el.status !== 'failed') statusFlag = true;
    });

    // Update status to 'failed' if each txn is failed
    if (!statusFlag) {
      payment.status = 'failed';
      await payment.save();
    }
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

const numTimesUserUsedPromotion = async (user, promotion) => {
  if (!user || !promotion) {
    logger.error('Missing required field in numTimesUserUsedPromotion');
    return Number.MAX_VALUE;
  }

  const userPayments = await paymentModel.find({ _user: ObjectId(user._id) });
  if (!userPayments || userPayments.length < 1) {
    return 0;
  }

  let count = 0;
  for (const payment of userPayments) {
    if (payment?.transactionType === 'Promotion' && payment?.promoId === promotion._id.toString() && payment.status !== 'failed') {
      ++count;
    }
  }

  return count;
};

export const getUserPromotionDetails = async (user, promoCode, purchaseProperty) => {
  try {
    logger.info('Inside get user promotion details service');
    if (!user || !promoCode) {
      logger.error(`Invalid input: ${user ? 'promoCode' : 'user'} is not defined.`);
      return { error: messages.INVALID_PROMO_CODE };
    }

    const promotion = await Promotions.findOne({ promoCode: promoCode }); // uniqueness of promoCode enforced in Mongo index
    if (!promotion || !promotion.promoStateIsOn) {
      logger.error(`Promo ${promoCode} ${promotion ? 'is off' : 'was not found'}.`);
      return { error: messages.INVALID_PROMO_CODE };
    }

    const now = moment().utc();
    if (promotion.promoStartDate && moment(promotion.promoStartDate).utc() > now) {
      logger.error(`Promo ${promoCode} start date ${promotion.promoStartDate} has not been hit yet.`);
      return { error: messages.INVALID_PROMO_CODE };
    }
    if (promotion.promoEndDate && moment(promotion.promoEndDate).utc() < now) {
      logger.error(`Promo ${promoCode} end date ${promotion.promoEndDate} has passed.`);
      return { error: messages.INVALID_PROMO_CODE };
    }

    const isSoldOut = promotion.promoGiftProperty.initialTokensForPromo - promotion.promoGiftProperty.tokensUsedForPromo <= 0;
    if (isSoldOut) {
      logger.error(
        `Promo ${promoCode} is sold out. (Initial tokens available was ${promotion.promoGiftProperty.initialTokensForPromo} and ${promotion.promoGiftProperty.tokensUsedForPromo} tokens have been sold.)`
      );
      return { error: messages.INVALID_PROMO_CODE };
    }

    const numUsed = await numTimesUserUsedPromotion(user, promotion);
    if (promotion.maxPromoCodeUse <= numUsed) {
      logger.error(`Promo code used ${numUsed} time${numUsed !== 1 ? 's' : ''} - max is ${promotion.maxPromoCodeUse} for promo ${promoCode}`);
      return { error: messages.INVALID_PROMO_CODE };
    }

    if (promotion.promoPurchaseProperties && !promotion.promoPurchaseProperties.includes('*') && !promotion.promoPurchaseProperties.find((x) => x === purchaseProperty)) {
      logger.error(`Promo ${promoCode} not valid for purchase property ${purchaseProperty}.`);
      return { error: messages.PROMO_CODE_NOT_VALID_FOR_PROPERTY };
    }

    const giftProperty = await Properties.findOne({ _id: ObjectId(promotion.promoGiftProperty.propertyId) });
    promotion.promoGiftProperty.propertyName = giftProperty?.otherInfo?.title || '';

    logger.info(`Promo ${promoCode} is valid. Returning details.`);
    return {
      data: {
        promoCode: promotion.promoCode,
        promoPurchaseProperties: promotion.promoPurchaseProperties,
        promoGiftProperty: promotion.promoGiftProperty,
      },
    };
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const withdrawalStatusCheckAndFundTransfer = async (paymentId) => {
  try {
    logger.info('Inside withdrawal status check and fund transfer service');
    const payment = await paymentModel.findOne({ _id: paymentId });
    if (!payment) return;

    let statusFlag = true;
    // Check for withdrawal IR credits status
    if (payment.withdrawnIRCredits.status === 'processing') statusFlag = false;

    // Check for withdrawal rent credits status
    payment.withdrawnRentCredits.forEach((el) => {
      if (el.status === 'processing') statusFlag = false;
    });

    if (statusFlag && payment.withdrawRequestedIRCreditsSettled + payment.withdrawRequestedRentCreditsSettled > 0) {
      // Make Fund transfer to user
      await transferWithdrawFundsToUser(payment);
    }
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getAdminPromotionDetails = async (req) => {
  try {
    logger.info('Inside get admin promotion user details service');
    const query = req.query || {};
    const page = parseInt(query.page) - 1 || 0;
    const limit = parseInt(query.limit) || 10;
    const filters = [];

    if (query.startDate && query.endDate) {
      query.startDate = dateFormats.dateToUtcStartDate(query.startDate);
      query.endDate = dateFormats.dateToUtcEndDate(query.endDate);
      filters.push({
        createdAt: {
          $gte: new Date(query.startDate),
          $lte: new Date(query.endDate),
        },
      });
    }

    if (query.promoStartDate && query.promoEndDate) {
      query.promoStartDate = dateFormats.dateToUtcStartDate(query.startDate);
      query.promoEndDate = dateFormats.dateToUtcEndDate(query.endDate);
      filters.push({
        promoStartDate: {
          $gte: new Date(query.startDate),
        },
        promoEndDate: {
          $lte: new Date(query.endDate),
        },
      });
    }

    if (query.promoCode) {
      filters.push({
        promoCode: query.promoCode,
      });
    }
    const filterQuery = filters.length === 0 ? {} : filters.length === 1 ? filters[0] : { $and: filters };

    let promotions = await paymentPromotionsModel
      .find(filterQuery)
      .skip(page * limit)
      .limit(limit);
    if (!promotions) {
      logger.error('Unable to retreive promotions.');
      return { error: 'Unable to retreive promotions.' };
    }

    const totalCount = await paymentPromotionsModel.count(filterQuery);
    return { data: promotions, totalCount };
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getAdminPromotionUserDetails = async (req) => {
  try {
    logger.info('Inside get admin promotion user details service');

    const query = req.query || {};
    const promoCode = query?.promoCode;
    if (!promoCode) {
      logger.error(`Invalid input: promoCode=${promoCode}`);
      return { error: messages.INVALID_PROMO_CODE };
    }

    const promotion = await Promotions.findOne({ promoCode: promoCode });
    if (!promotion) {
      logger.error(`Promo ${promoCode} was not found.`);
      return { error: messages.INVALID_PROMO_CODE };
    }

    const page = parseInt(query.page) - 1 || 0;
    const limit = parseInt(query.limit) || 10;
    const filters = [];

    if (query.startDate && query.endDate) {
      query.startDate = dateFormats.dateToUtcStartDate(query.startDate);
      query.endDate = dateFormats.dateToUtcEndDate(query.endDate);
      filters.push({
        createdAt: {
          $gte: new Date(query.startDate),
          $lte: new Date(query.endDate),
        },
      });
    }

    const filterQuery = filters.length === 0 ? {} : filters.length === 1 ? filters[0] : { $and: filters };

    const promoPayments = await paymentModel
      .find({ promoId: promotion._id, ...filterQuery })
      .skip(page * limit)
      .limit(limit);
    if (!promoPayments) {
      return { data: [] };
    }

    const userMap = {};
    for (const payment of promoPayments) {
      const userId = payment._user;
      if (!userMap[userId]) {
        const user = await userModel.findOne({ _id: userId });
        if (!user) {
          logger.error(`Unable to retreive user ${userId} for payment`);
          break;
        }
        userMap[userId] = {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          userId: user._id,
          amountInvested: 0,
          amountGifted: 0,
          amountGiftPending: 0,
          amountPending: 0,
          amountPosted: 0,
        };
      }

      if (payment.transactionType === 'Checkout') {
        if (payment.status === 'succeeded') {
          userMap[userId].amountInvested = payment.amount.amount - payment.fees.amount + userMap[userId].amountInvested;
        } else if (payment.status === 'pending') {
          userMap[userId].amountPending = payment.amount.amount - payment.fees.amount + userMap[userId].amountPending;
        } else if (payment.status === 'posted') {
          userMap[userId].amountPosted = payment.amount.amount - payment.fees.amount + userMap[userId].amountPosted;
        }
      } else if (payment.transactionType === 'Promotion') {
        if (payment.status === 'succeeded') {
          userMap[userId].amountGifted = payment.holdTokens + userMap[userId].amountGifted;
        } else if (payment.status === 'pending' || payment.status === 'posted') {
          userMap[userId].amountGiftPending = payment.holdTokens + userMap[userId].amountGiftPending;
        }
      }
    }

    const totalCount = await paymentModel.distinct('_user', { promoId: promotion._id, ...filterQuery });

    return { data: Object.values(userMap), totalCount: totalCount.length };
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const addOrUpdatePromotion = async (req) => {
  try {
    logger.info('Inside add or update promotion service');

    const validation = await updatePromotionValidator(req.body);
    if (validation?.error) {
      return { error: validation.message };
    }

    let promoObj = await paymentPromotionsModel.findOne({ promoCode: req.body.promoCode });
    if (!promoObj) {
      promoObj = req.body;
      promoObj.createdAt = new Date();
      promoObj.updatedAt = new Date();
      const result = await Promotions.insertOne(promoObj);
      if (!result) {
        logger.error('Error adding new promotion object to database. Details: ' + JSON.stringify(promoObj));
        return { error: 'Error creating promotion' };
      }
      logger.info(`Successfully created new promo ${promoObj.promoCode}`);
    } else {
      Object.keys(promoObj.toObject()).forEach(function (key, index) {
        if (req.body[key] !== undefined && req.body[key] !== null) {
          promoObj[key] = req.body[key];
          promoObj.markModified(key);
        }
      });
      promoObj.updatedAt = new Date();
      await promoObj.save();
      logger.info(`Successfully updated promo ${promoObj.promoCode}`);
    }
    return { data: 'Success' };
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getPromotionTransactionsForUser = async (req) => {
  try {
    logger.info('Inside get promotion transactions for user service');

    const query = req.query || {};
    const userId = query.userId;
    const promoCode = query.promoCode;
    if (!userId) {
      return { error: 'userId is required' };
    }
    if (!promoCode) {
      return { error: 'promoCode is required' };
    }

    const promotion = await paymentPromotionsModel.findOne({ promoCode: promoCode });
    if (!promotion) {
      return { error: `Promo code ${promoCode} not found` };
    }

    const page = parseInt(query.page) - 1 || 0;
    const limit = parseInt(query.limit) || 10;
    const filters = [{ promoId: promotion._id }, { _user: ObjectId(userId) }];

    if (query.startDate && query.endDate) {
      query.startDate = dateFormats.dateToUtcStartDate(query.startDate);
      query.endDate = dateFormats.dateToUtcEndDate(query.endDate);
      filters.push({
        createdAt: {
          $gte: new Date(query.startDate),
          $lte: new Date(query.endDate),
        },
      });
    }

    const filterQuery = filters.length === 0 ? {} : filters.length === 1 ? filters[0] : { $and: filters };

    const promoPayments = await paymentModel
      .find(filterQuery)
      .skip(page * limit)
      .limit(limit);
    if (!promoPayments) {
      return { data: [] };
    }

    const totalCount = await paymentModel.count(filterQuery);

    return { data: promoPayments, totalCount };
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

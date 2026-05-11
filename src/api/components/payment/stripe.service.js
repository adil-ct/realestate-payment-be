import mongoose from 'mongoose';
import moment from 'moment';
import axios from 'axios';
import Stripe from 'stripe';
import config from '../../config/config.js';
import logger from '../../config/logger.js';
import Payment from './model.js';
import AdminPayment from './paymentAdminModel.js';
import User from './userModel.js';
import PropertyOrders from './orders.model.js';
import db from '../../connections/dbMaster.js';
import constants from '../../config/constants.js';
import { holdTokensInOrders, holdUserCredits } from './property.service.js';
import { generateuuid } from '../../helpers/helpers.js';
import Transfer from './transfers.model.js';
const Property = db.collection('property');
const PropertyBalance = db.collection('property-balance');
const Referral = db.collection('referral');
const ObjectId = mongoose.Types.ObjectId;

const stripe = new Stripe((await config.stripe).secretKey, {
  apiVersion: '2020-08-27',
});

export const addCardToCustomer = async (customerId, sourceToken, saveCard) => {
  try {
    logger.info('Inside add card to customer service');
    if (!customerId || !sourceToken) return { error: 'Customer not found' };
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        token: sourceToken,
      },
    });

    if (saveCard) {
      await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: customerId,
      });
      const defaultPaymentMethod = await getDefaultPaymentMethodId(customerId);
      if (!defaultPaymentMethod) updateToDefaultCard(customerId, paymentMethod.id);
      const cards = await getAllCardsForUser(customerId);
      const numberOfCards = cards.data.filter((obj) => {
        if (obj.card.fingerprint !== paymentMethod.card.fingerprint) return false;
        if (obj.card.exp_month !== paymentMethod.card.exp_month) return false;
        if (obj.card.exp_year !== paymentMethod.card.exp_year) return false;
        if (obj.card.last4 !== paymentMethod.card.last4) return false;
        return true;
      }).length;

      if (numberOfCards > 1) {
        removeCardFromCustomer(paymentMethod.id);
        return { error: 'Card Duplicaition' };
      }
    }
    return paymentMethod;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getDefaultPaymentMethodId = async (customerId) => {
  const customer = await stripe.customers.retrieve(customerId);
  return customer.invoice_settings.default_payment_method;
};

export const updateToDefaultCard = async (customerId, paymentMethodId) => {
  if (!customerId || !paymentMethodId) return { error: 'No payment method found for customer', status: 400 };
  return await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
};

export const getAllCardsForUser = async (customerId, dataObj = {}) => {
  try {
    logger.info('Inside getAllCardsForUser service');
    if (!customerId) return { error: 'Customer not found' };
    const { page, limit, search } = dataObj;
    const perPage = +limit > 0 ? Number(limit) : 10;
    const startIndex = +page > 0 ? Number(page) - 1 : 0;
    const result = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 100,
    });

    let data = result.data;

    if (search) {
      data = data
        .map((item) => {
          let regex = new RegExp(`${search}`, 'i');
          if (item?.card?.brand && item?.card?.brand.match(regex)) return item;
        })
        .filter((item) => item);
    }

    const totalCount = data.length;
    data = data.slice(startIndex * perPage, startIndex * perPage + perPage);
    return { totalCount, data };
  } catch (err) {
    logger.error(err.message, err);
    return { error: err.message };
  }
};

export const removeCardFromCustomer = async (paymentMethodId) => {
  try {
    return await stripe.paymentMethods.detach(paymentMethodId);
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const checkUserPaymentMethod = async (customerId, paymentMethodId) => {
  try {
    logger.info('Inside check user card service');
    if (!customerId || !paymentMethodId) return { error: 'Payment Method not found' };
    const card = await stripe.customers.retrievePaymentMethod(customerId, paymentMethodId);
    return card;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const createSetupIntent = async (customerId) => {
  try {
    logger.info('Inside createSetupIntent service');
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['us_bank_account'],
      payment_method_options: {
        us_bank_account: {
          verification_method: 'automatic',
          financial_connections: {
            permissions: ['payment_method'],
          },
        },
      },
    });
    return setupIntent;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const paymentIntent = async (userId, customerId, data, property) => {
  try {
    logger.info('Inside payment Intent service');
    if (!customerId || !data) return { error: 'Invalid Payment Intent' };

    /* Check if request tokens are available */
    const tokensAvailable = await tokensAvailableAtSale(property._id);
    if (!tokensAvailable || tokensAvailable < data.tokens) {
      return { error: 'Requested tokens are not available at sale', status: 400 };
    }

    const user = await User.findOne({ _id: userId });

    if (user && user?.userType !== 'admin' && property?.crowdSale?.minInvestment) {
      const fetchTokenBalance = await PropertyBalance.findOne({
        _user: user._id,
        _property: property._id,
      });
      if (!fetchTokenBalance) {
        if (parseFloat(data.amount) < property?.crowdSale?.minInvestment) {
          return {
            error: `Minimum investment required is $${property?.crowdSale?.minInvestment}`,
          };
        }
      }
    }

    const amountInCents = parseInt(data.amount * 100);

    if (amountInCents === 0 && data.credits === 0) return { error: 'Invalid Payment Request' };

    if (data.credits > 0) {
      if (user.credits < data.credits) {
        return { error: 'Insufficient credits' };
      }
    }

    if (amountInCents > 0) {
      let fees = 0;
      if (data.paymentMethodType === 'card') {
        if (data?.international) {
          fees = parseInt(amountInCents * (4.4 / 100) + 30);
        } else {
          fees = parseInt(amountInCents * (2.9 / 100) + 30);
        }
      }
      if (data.paymentMethodType === 'us_bank_account') {
        fees = amountInCents * (0.8 / 100) < 500 ? parseInt(amountInCents * (0.8 / 100)) : 500;
      }

      const intent = await stripe.paymentIntents.create({
        amount: amountInCents,
        description: data.description ?? `Payment Intent created for customer: ${customerId}`,
        currency: 'usd',
        customer: customerId,
        payment_method_types: [data.paymentMethodType],
        payment_method: data.paymentMethodId,
        confirm: true,
        application_fee_amount: fees,
        transfer_data: {
          destination: property.stripeConnect ?? constants.stripeConnect,
        },
        statement_descriptor: property?.otherInfo.title,
        statement_descriptor_suffix: property?.otherInfo.title,
      });

      if (intent?.error) return { error: intent.error };
      let balanceTxn;
      if (data.paymentMethodType === 'card' && intent?.charges?.data[0]?.balance_transaction) {
        balanceTxn = await stripe.balanceTransactions.retrieve(intent.charges.data[0].balance_transaction);
      }
      if (balanceTxn) {
        fees = balanceTxn.fee;
      }
      const status = intent?.status === 'processing' ? 'pending' : intent.status;

      const holdOrders = await holdTokensInOrders(data.tokens, property._id);
      await holdUserCredits(data.credits, userId);
      const payment = await Payment.create({
        id: intent.id,
        amount: {
          amount: intent.amount / 100,
        },
        fees: {
          amount: fees / 100,
        },
        transactionType: 'Checkout',
        status,
        _user: userId,
        customerId,
        paymentMethod: intent.charges.data[0].payment_method_details.type ?? data.paymentMethodType,
        balanceTx: intent.charges.data[0].balance_transaction ?? '',
        chargeId: intent.charges.data[0].id ?? '',
        paymentMethodId: intent.payment_method ?? '',
        destination: intent?.transfer_data?.destination ?? '',
        propertyId: property?._id,
        propertyName: property?.otherInfo.title ?? '',
        holdTokens: data?.tokens,
        investmentStatus: 'pending',
        holdOrders,
        holdCredits: data.credits,
      });
      return payment;
    } else {
      const holdOrders = await holdTokensInOrders(data.tokens, property._id);
      await holdUserCredits(data.credits, userId);
      const payment = await Payment.create({
        amount: {
          amount: 0,
        },
        fees: {
          amount: 0,
        },
        transactionType: 'Checkout',
        status: 'succeeded',
        _user: userId,
        customerId,
        paymentMethod: data.paymentMethodType ?? '',
        balanceTx: '',
        chargeId: '',
        paymentMethodId: data.paymentMethodId ?? '',
        destination: property.stripeConnect ?? constants.stripeConnect,
        propertyId: property?._id,
        propertyName: property?.otherInfo.title ?? '',
        holdTokens: data?.tokens,
        investmentStatus: 'pending',
        holdOrders,
        holdCredits: data.credits,
      });
      return payment;
    }
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const getAllBanksForUser = async (customerId, dataObj = {}) => {
  try {
    logger.info('Inside getAllBanksForUser service');
    const { page, limit, search } = dataObj;
    const perPage = +limit > 0 ? Number(limit) : 10;
    const startIndex = +page > 0 ? Number(page) - 1 : 0;
    if (!customerId) return { error: 'Customer not found' };
    const result = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'us_bank_account',
      limit: 100,
    });

    let data = result.data;
    if (search) {
      data = data
        .map((item) => {
          let regex = new RegExp(`${search}`, 'i');
          if (item?.us_bank_account?.bank_name && item?.us_bank_account?.bank_name.match(regex)) return item;
        })
        .filter((item) => item);
    }

    const totalCount = data.length;
    data = data.slice(startIndex * perPage, startIndex * perPage + perPage);
    return { totalCount, data };
  } catch (err) {
    logger.error(err.message, err);
    return { error: err.message };
  }
};

export const userPaymentMethods = async (customerId) => {
  try {
    logger.info('Inside getAllBanksForUser service');
    if (!customerId) return { error: 'Customer not found' };

    const cards = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 100,
    });

    const bankAcc = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'us_bank_account',
      limit: 100,
    });

    let paymentMethods = [...bankAcc.data, ...cards.data];

    /* Fetch Default Payment method */
    const defaultPaymentMethod = await getDefaultPaymentMethodId(customerId);

    let defaultMethod;
    if (!defaultPaymentMethod?.error && defaultPaymentMethod) {
      paymentMethods?.forEach((el) => {
        if (el.id === defaultPaymentMethod) {
          el.defaultMethod = true;
          defaultMethod = el;
        }
      });
    }

    const totalCount = paymentMethods.length;
    return { totalCount, paymentMethods, defaultMethod };
  } catch (err) {
    logger.error(err.message, err);
    return { error: err.message };
  }
};

export const fetchLastPayment = async (customerId, paymentMethod, isAdmin) => {
  try {
    logger.info('Inside fetch last payment service');
    if (!customerId) return { error: 'Customer not found' };
    let list;
    if (isAdmin) {
      list = await AdminPayment.find({ customerId, paymentMethod });
    } else {
      list = await Payment.find({ customerId, paymentMethod });
    }
    if (list.length > 0) return list[0];
    return null;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const fetchPropertyDetails = async (propertyId) => {
  try {
    logger.info('Inside fetch property details service');
    const property = Property.findOne({ _id: ObjectId(propertyId) });
    return property;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const makeInvestment = async (paymentIntent) => {
  try {
    logger.info('Inside make investment service');
    const data = {
      propertyId: paymentIntent.propertyId.toString(),
      paymentId: paymentIntent._id.toString(),
    };
    const mogulapikey = await config.mogulApiKey;
    await axios.post(`${(await config.apiUrls).marketplace}/invest`, data, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        mogulapikey,
      },
    });
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const unblockTokensAndCredits = async (paymentIntent) => {
  try {
    logger.info('Inside unblock tokens and credits service');
    /* Unblock credits */
    if (paymentIntent.holdCredits > 0) {
      await User.updateOne({ _id: paymentIntent._user }, { $inc: { creditsOnHold: -paymentIntent.holdCredits, credits: paymentIntent.holdCredits } });
    }
    /* Unblock tokens */
    const orderIds = paymentIntent.holdOrders.map((el) => el.id);
    const orders = await PropertyOrders.find({ _id: { $in: orderIds } });
    for (let i = 0; i < orders.length; i++) {
      for (let j = 0; j < paymentIntent.holdOrders.length; j++) {
        if (paymentIntent.holdOrders[j].id.toString() === orders[i]._id.toString()) {
          orders[i].tokens += paymentIntent.holdOrders[j].hold;
          orders[i].tokensOnHold -= paymentIntent.holdOrders[j].hold;
          await orders[i].save();
        }
      }
    }
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const tokensAvailableAtSale = async (propertyId) => {
  try {
    logger.info('Inside tokens available at sale service');
    const status = ['pending', 'partial'];
    const tokens = await PropertyOrders.aggregate([
      {
        $match: { _property: propertyId, status: { $in: status } },
      },
      {
        $group: {
          _id: '$_property',
          availableTokens: { $sum: '$tokens' },
        },
      },
    ]);
    if (tokens?.length === 0) return null;
    return tokens[0].availableTokens;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const addCreditsToReferralUser = async (paymentId) => {
  try {
    logger.info('Inside add credits to referral user service');
    const payment = await Payment.findOne({ _id: paymentId });
    if (!payment) return;
    const property = await Property.findOne({ _id: payment.propertyId });
    const referral = await Referral.findOne({ 'referee.refereeId': payment._user });
    if (!referral) return;
    let referee;
    referral.referee.forEach((it) => {
      if (it.refereeId.toString() === payment._user.toString()) {
        referee = it;
      }
    });
    if (!referee) return;
    if (payment.createdAt > moment(referee.timer).add(1, 'day')) {
      return;
    }

    // check for payment timeline
    let totalAamountSettled = referee.amountSettled;
    const actualInvestment = parseFloat(payment.amount.amount) - parseFloat(payment.fees.amount);
    if (payment.createdAt < moment(referee.timer).add(1, 'day')) {
      totalAamountSettled = totalAamountSettled + actualInvestment;
    }

    // calculating 5% of invested amount
    const reward = parseFloat((actualInvestment * (5 / 100)).toFixed(2));
    const updatedReward = parseFloat(referee.reward) + reward;
    const totalReward = parseFloat(referral.referralEarnings) + parseFloat(reward);
    await Referral.updateOne(
      { 'referee.refereeId': payment._user },
      { $set: { referralEarnings: totalReward, 'referee.$.reward': updatedReward, 'referee.$.amountSettled': totalAamountSettled } }
    );
    await User.updateOne({ _id: referral.referralId }, { $inc: { credits: reward } });
    const transferRequest = {
      id: await generateuuid(),
      amount: {
        amount: reward,
      },
      transactionType: 'referral',
      transferType: 'received',
      status: 'completed',
      propertyId: payment.propertyId,
      propertyName: property.otherInfo.title,
      admin: false,
      merchant: false,
      userId: referral.referralId,
      transactionId: payment._id, // To fetch the payment doc against which reward is earned
      referral: true,
      refereeId: payment._user,
    };
    await Transfer.create(transferRequest);
    await Payment.updateOne({ _id: paymentId }, { rewards: reward });
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const updateReferralDocForAffiliate = async (paymentId) => {
  try {
    logger.info('Inside update referral doc for affiliate');
    const payment = await Payment.findOne({ _id: paymentId });
    if (!payment) return;
    const referral = await Referral.findOne({ 'referee.refereeId': payment._user });
    if (!referral) return;
    let referee;
    referral.referee.forEach((it) => {
      if (it.refereeId.toString() === payment._user.toString()) {
        referee = it;
      }
    });
    if (!referee) return;
    if (payment.createdAt > moment(referee.timer).add(1, 'day')) {
      return;
    }
    const updatedInvestment = parseFloat(referee.amountInvestedInTimer) - parseFloat(payment.amount.amount);
    await Referral.updateOne({ 'referee.refereeId': payment._user }, { $set: { 'referee.$.amountInvestedInTimer': updatedInvestment } });

    if (referee.reward === 0) {
      let nextPayment = await Payment.findOne({ _user: payment._user, _id: { $nin: [paymentId] } });
      if (!nextPayment) await Referral.updateOne({ 'referee.refereeId': payment._user }, { $set: { 'referee.$.timer': undefined } });
      else await Referral.updateOne({ 'referee.refereeId': payment._user }, { $set: { 'referee.$.timer': nextPayment.createdAt } });
    }
    return;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

import mongoose from 'mongoose';
import moment from 'moment';
import db from '../../connections/dbMaster.js';
import config from '../../config/config.js';
import logger from '../../config/logger.js';
import { handleResponse, handleError } from '../../helpers/requestHandler.js';
import { plaidRequest } from './plaid.service.js';
import constants from '../../config/constants.js';
import message from '../../config/messages.js';
import User from './userModel.js';
import Payment from './model.js';
import { updateUser, getUserPromotionDetails } from './service.js';
import { generateuuid } from '../../helpers/helpers.js';
import { tokensAvailableAtSale, unblockTokensAndCredits } from './stripe.service.js';
import { holdTokensInOrders, holdUserCredits } from './property.service.js';
import { plaidTransferValidator } from './validator.js';
import { rejectTransferForFraud } from '../../helpers/plaid.js';
const Property = db.collection('property');
const PropertyBalance = db.collection('property-balance');
const Promotions = db.collection('promotions');
const Referral = db.collection('referral');
const ObjectId = mongoose.Types.ObjectId;

const plaid = {
  client_id: (await config.plaid).clientId,
  secret: (await config.plaid).secret,
};

const createPromotionTransaction = async (user, promotion, purchaseRefObject) => {
  try {
    logger.info('Inside create Promotion Transaction controller');
    if(!promotion || !promotion.promoGiftProperty) {
      return { error : 'Invalid promotion entered'};
    }

    if(!purchaseRefObject) {
      return { error : 'Invalid purchase reference'};
    }

    const purchaseAmount = (Number(purchaseRefObject.amount?.amount) - purchaseRefObject.fees?.amount) || 0;
    if(!purchaseAmount || purchaseAmount <= 0) {
      return { error : `Invalid purchase amount ${purchaseAmount}`};
    }

    let promoAmount = 0;
    const tiers = promotion.promoGiftProperty.promoTiers.sort((a, b) => a.investAmount - b.investAmount);
    for (const tier of tiers) {
      if(purchaseAmount >= tier.investAmount) {
        promoAmount = tier.numGiftTokens;
      } else {
        break;
      }
    }

    const referencePaymentId = purchaseRefObject.id;
    const promoProperty = await Property.findOne({ '_id': ObjectId(promotion.promoGiftProperty.propertyId) });
    if(!promoProperty) {
      return { error : 'Invalid promotion property'};
    }

    const holdOrders = await holdTokensInOrders(promoAmount, promoProperty._id);
    if(!holdOrders || holdOrders.error) {
      logger.error(`Unable to reserve ${purchaseAmount} promotional tokens of property ${promoProperty._id} for user ${user_id}`);
      return { error : holdOrders?.error || `Error reserving tokens`};
    }

    const paymentObject = {
      id: purchaseRefObject.referenceId,
      amount: { amount: 0 },
      quoteCurrencyAmount: 0,
      fees: { amount: 0 },
      transactionType: 'Promotion',
      status: 'pending',
      _user: user._id,
      paymentMethod: 'promotion_transfer',
      referenceId: referencePaymentId,
      promoId: promotion._id,
      propertyId: promoProperty._id,
      propertyName: promoProperty.otherInfo.title,
      holdTokens: promoAmount,
      holdCredits: { credits: 0, rentCredits: 0 },
      holdOrders: holdOrders,
      investmentStatus: 'pending',
      affiliate: false,
    };

    const payment = await Payment.create(paymentObject);
    if (!payment) {
      logger.error('Error adding payment object to database. Details: ' + JSON.stringify(paymentObject));
      return { error : 'Error creating promotion'}
    }

    await Promotions.updateOne({ _id: promotion._id }, { 
      $set: { 'promoGiftProperty.tokensUsedForPromo' : promoAmount + promotion.promoGiftProperty.tokensUsedForPromo }
    });

    return { data: payment };
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const createLinkToken = async (req, res) => {
  try {
    logger.info('Inside create Link Token API controller');
    const user = req.user;
    const linkTokenCreateRequest = {
      client_id: plaid.client_id,
      secret: plaid.secret,
      user: {
        client_user_id: user._id,
      },
      client_name: constants.plaid.client_name,
      products: ['auth', 'transfer'],
      country_codes: ['US'],
      language: 'en',
      webhook: (await config.paymentServiceUrl) + '/webhook/plaid',
    };
    // if (plaid.useFraudMonitoring) {
    //   linkTokenCreateRequest.products.push('signal');
    // }

    const linkTokenResponse = await plaidRequest('link/token/create', linkTokenCreateRequest);
    if (linkTokenResponse?.error) {
      return handleError({ res, err: linkTokenResponse.error });
    }
    return handleResponse({ res, msg: message.PLAID_LINK_TOKEN, data: { linkTokenResponse } });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const accessToken = async (req, res) => {
  try {
    logger.info('Inside access token API controller');
    const user = await req.user;
    const { public_token } = req.body;
    if (!public_token) return handleError({ res, err: 'Public token is required', statusCode: 400 });
    if (!public_token) {
      return handleError({ res, err: message.INVALID_DATA, statusCode: 400 });
    }
    /* Exchange public_token for access_token */
    const getAccessTokenRequest = {
      client_id: plaid.client_id,
      secret: plaid.secret,
      public_token,
    };
    const accessTokenResponse = await plaidRequest('item/public_token/exchange', getAccessTokenRequest);
    if (accessTokenResponse?.error) {
      return handleError({ res, err: accessTokenResponse.error });
    }
    const access_token = accessTokenResponse.access_token;
    /* Fetch Bank details using acess_token */
    const authGetRequest = {
      client_id: plaid.client_id,
      secret: plaid.secret,
      access_token,
    };
    const authGetResponse = await plaidRequest('auth/get', authGetRequest);
    if (authGetResponse?.error) return handleError({ res, err: authGetResponse.error });

    delete authGetResponse?.accounts[0]?.balances;
    delete authGetResponse?.accounts[0]?.type;
    /* Store access_token and bank details for future transfers */
    const bankData = {
      access_token,
      ...authGetResponse.accounts[0],
      _id: mongoose.Types.ObjectId(),
    };
    const query = { $push: { bank: bankData } };
    const updated = await updateUser(user._id, query);
    if (updated?.error) return handleError({ res, err: updated.error });
    delete bankData.access_token;
    return handleResponse({ res, data: bankData, msg: message.BANK_LINKED });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const getAccounts = async (req, res) => {
  try {
    logger.info('Inside get accounts API controller');
    const user = req.user;
    let banks;
    let defaultMethod = [];
    if (user.bank) {
      banks = user.bank.map((el) => {
        let bankData = {
          id: el.account_id,
          mask: el.mask,
          name: el.name,
          official_name: el.official_name,
          default: el.default,
          _id: el._id,
        };
        if (el.default) defaultMethod.push(bankData);
        return bankData;
      });
    } else {
      banks = [];
    }
    [defaultMethod] = defaultMethod;
    return handleResponse({ res, msg: message.BANK_ACCOUNTS_LIST, data: { defaultMethod: defaultMethod, paymentMethods: banks } });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const authorizeAndTransfer = async (req, res) => {
  try {
    logger.info('Inside transfer authorize API controller');
    const user = req.user;

    /* Joi validation for request body */
    const validation = plaidTransferValidator(req.body);
    if (validation?.error) return handleError({ res, err: validation.message });

    const { amount, ip_address, bank_id, propertyId, tokens, credits } = req.body;

    /* Check for Property */
    const property = await Property.findOne({ _id: ObjectId(propertyId) });
    if (!property) return handleError({ res, err: message.PROPERTY_NOT_FOUND, statusCode: 400 });

    /* Check for tokens available at sale */
    const tokensAvailable = await tokensAvailableAtSale(property._id);
    if (!tokensAvailable || tokensAvailable < tokens) {
      return handleError({ res, err: 'Requested tokens are not available at sale', statusCode: 400 });
    }

    const pricePerToken =
      (property.financials.propertyValues[property.financials.propertyValues.length - 1].value - property.financials.currentDebt) / property.crowdSale.numberOfTokens;

    /* User's property balance */
    if (user && user?.userType !== 'admin') {
      let minInvest = property.crowdSale.minInvestment ?? (await config.crowdSale).minInvestment;

      if (parseFloat(tokensAvailable * pricePerToken) < parseFloat(minInvest)) {
        minInvest = parseFloat(tokensAvailable * pricePerToken);
      }

      if (parseFloat(amount) + parseFloat(credits) < parseFloat(minInvest)) {
        return handleError({
          res,
          err: `Minimum investment required is $${minInvest}`,
          statusCode: 400,
        });
      }
    }

    /* Check for 0 amount */
    if (credits === 0 && amount === 0) return handleError({ res, err: 'Invalid Payment Request' });

    let rentCreditsToHold = 0;
    let creditsToHold = 0;
    /* Check user credits */
    if (credits > 0) {
      if (user.credits + user.rentCredits < credits) {
        return handleError({ res, err: 'Insufficient credits', statusCode: 400 });
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
    const amountNum = parseFloat(amount);
    if (amountNum > 0) {
      const user_agent = req.body.userAgent ? req.body.userAgent : req.headers['user-agent'];
      const bank = user.bank.filter((el) => el._id.toString() === bank_id);
      if (bank.length === 0) return handleError({ res, err: message.NO_BANK, statusCode: 400 });
      const { account_id, access_token } = bank[0];

      /* Add mogul fee and processing fee */
      let mogulFee = (await config.mogulFee) ?? 0;
      let processingFee = (await config.processingFee) ?? 0;

      /* Added threshold for fees in case of any tampering wih secrets manager values */
      mogulFee = mogulFee > 20 ? 20 : mogulFee;
      processingFee = processingFee > 20 ? 20 : processingFee;

      const fee = parseFloat(mogulFee) + parseFloat(processingFee);
      const amountToPay = (amountNum + fee).toFixed(2);

      /* Check for fraud if enabled */
      const uniqueId = await generateuuid();
      const fraudInfo = await rejectTransferForFraud(amountNum, ip_address, user_agent, user, account_id, access_token, uniqueId);
      if (fraudInfo?.rejected) {
        // Log to the database
        paymentObject = {
          id: uniqueId,
          amount: { amount: 0 },
          quoteCurrencyAmount: 0,
          fees: { amount: 0 },
          transactionType: 'Checkout',
          status: 'rejected',
          bankAccountId: '',
          _user: user._id,
          paymentMethod: 'ach_bank_transfer',
          propertyId: property._id,
          propertyName: property.otherInfo.title,
          holdTokens: tokens,
          holdCredits: credits,
          investmentStatus: 'failed',
          fraudInfo: {
            fraudTransactionUniqueId: uniqueId,
            details: fraudInfo.details,
            reported: fraudInfo.reported,
          },
        };
        const payment = await Payment.create(paymentObject);
        if (!payment) {
          logger.error('Error adding rejected payment to database. Details: ' + JSON.stringify(paymentObject));
        }

        // Release the held tokens
        // await unblockTokensAndCredits(payment); // => No need to unblock tokens and credits here as they are getting blocked after payment success

        return handleError({ res, err: message.PLAID_FRAUD_MONITORING_REJECT_TRANSACTION, statusCode: 400 });
      }

      /* Authorize Transfer */
      const transferAuthorizationCreateRequest = {
        client_id: plaid.client_id,
        secret: plaid.secret,
        type: 'debit', // A debit indicates a transfer of money into the origination account; a credit indicates a transfer of money out of the origination account.
        network: 'same-day-ach',
        amount: amountToPay.toString(),
        ach_class: 'web',
        access_token,
        account_id,
        user: {
          legal_name: (user.firstName + ' ' + user.lastName).substring(0, 21),
          email_address: user.email,
        },
        device: {
          ip_address,
          user_agent,
        },
        user_present: false,
        idempotency_key: await generateuuid(),
      };
      const transferAuthorizationResponse = await plaidRequest('transfer/authorization/create', transferAuthorizationCreateRequest);

      if (transferAuthorizationResponse?.error){
        return handleError({ res, err: transferAuthorizationResponse.error });
      } 

      if (transferAuthorizationResponse?.authorization?.decision === 'declined') {
        return handleError({ res, err: transferAuthorizationResponse.authorization.decision_rationale.description, statusCode: 400 });
      }

      /* Create Transfer */
      const transferCreateRequest = {
        client_id: plaid.client_id,
        secret: plaid.secret,
        amount: transferAuthorizationResponse.authorization.proposed_transfer.amount,
        description: 'payment',
        authorization_id: transferAuthorizationResponse.authorization.id,
        access_token,
        account_id,
      };
      const transferCreateResponse = await plaidRequest('transfer/create', transferCreateRequest);

      if (transferCreateResponse?.error) return handleError({ res, err: transferCreateResponse.error });
      paymentObject = {
        id: transferCreateResponse.transfer.id,
        amount: { amount: transferCreateResponse.transfer.amount },
        quoteCurrencyAmount: transferCreateResponse.transfer.amount,
        fees: { amount: fee },
        transactionType: 'Checkout',
        status: 'pending',
        bankAccountId: account_id,
        _user: user._id,
        paymentMethod: 'ach_bank_transfer',
        propertyId: property._id,
        propertyName: property.otherInfo.title,
        holdTokens: tokens,
        holdCredits: { credits: creditsToHold, rentCredits: rentCreditsToHold },
        investmentStatus: 'pending',
        plaidSweepStatus: 'unswept',
        affiliate: false,
      };

      /* Check for promotion */
      if(req.body.promoCode) {
        const promo = await getUserPromotionDetails(user, req.body.promoCode, property._id);
        if(!promo || promo.error) { 
          return handleError({ res, err: promo.error });
        }

        const promotion = await Promotions.findOne({ 'promoCode': req.body.promoCode });
        const promoPaymentId = await generateuuid();
        paymentObject.referenceId = promoPaymentId;
        paymentObject.promoId = promotion._id;
        
        const promoResult = await createPromotionTransaction(user, promotion, paymentObject);
        if(!promoResult || promoResult.error) { 
          return handleError({ res, err: promoResult.error });
        }
        
      }

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
            refereeInvestmentInTimer = parseFloat(
              (refereeInvestmentInTimer + (parseFloat(transferCreateResponse.transfer.amount) - parseFloat(paymentObject.fees.amount))).toFixed(2)
            );
            await Referral.updateOne({ 'referee.refereeId': user._id }, { $set: { 'referee.$.timer': new Date(), 'referee.$.amountInvestedInTimer': refereeInvestmentInTimer } });
          } else {
            if (moment(referee.timer).add(1, 'day') > new Date()) {
              refereeInvestmentInTimer = parseFloat(
                (refereeInvestmentInTimer + (parseFloat(transferCreateResponse.transfer.amount) - parseFloat(paymentObject.fees.amount))).toFixed(2)
              );
              await Referral.updateOne({ 'referee.refereeId': user._id }, { $set: { 'referee.$.amountInvestedInTimer': refereeInvestmentInTimer } });
            }
          }
        }
        paymentObject.affiliate = true;
      }
    } else {
      paymentObject = {
        id: await generateuuid(),
        amount: { amount: 0 },
        quoteCurrencyAmount: 0,
        fees: { amount: 0 },
        transactionType: 'Checkout',
        status: 'succeeded',
        bankAccountId: '',
        _user: user._id,
        paymentMethod: 'ach_bank_transfer',
        propertyId: property._id,
        propertyName: property.otherInfo.title,
        holdTokens: tokens,
        holdCredits: { credits: creditsToHold, rentCredits: rentCreditsToHold },
        investmentStatus: 'pending',
        plaidSweepStatus: 'swept_settled',
        affiliate: false,
      };
    }

    /* Hold orders */
    const holdOrders = await holdTokensInOrders(tokens, property._id);

    /* Hold Credits */
    if (credits > 0) {
      await holdUserCredits(creditsToHold, rentCreditsToHold, user._id);
    }

    paymentObject.holdOrders = holdOrders;
    const payment = await Payment.create(paymentObject);
    return handleResponse({ res, data: payment });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const unlinkAccount = async (req, res) => {
  try {
    logger.info('Inside unlink bank account API controller');
    const user = req.user;
    const { bank_id } = req.params;
    if (user.bank) {
      const bankExist = user.bank.find((el) => {
        if (el._id === bank_id) {
          return true;
        } else return false;
      });
      if (bankExist) {
        const query = { $pull: { bank: { _id: bank_id } } };
        const updated = await updateUser(user._id, query);
        if (updated?.error) return handleError({ res, err: updated.error });
      } else {
        return handleError({ res, err: message.NO_BANK, statusCode: 400 });
      }
    } else {
      return handleError({ res, err: message.NO_BANK, statusCode: 400 });
    }
    return handleResponse({ res, msg: message.BANK_UNLINKED });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const setDefault = async (req, res) => {
  try {
    logger.info('Inside set default API controller');
    const user = req.user;
    const { bank_id } = req.body;
    if (!bank_id) return handleError({ res, err: 'Bank id is required', statusCode: 400 });
    if (user.bank) {
      const bankExist = user.bank.find((el) => {
        if (el._id === bank_id) {
          return true;
        } else return false;
      });
      if (bankExist) {
        let defaultBankId;
        user.bank.forEach((el) => {
          if (el.default === true) defaultBankId = el._id;
        });
        await User.updateOne({ _id: user._id, 'bank._id': defaultBankId }, { 'bank.$.default': false });
        await User.updateOne({ _id: user._id, 'bank._id': ObjectId(bank_id) }, { 'bank.$.default': true });
      } else {
        return handleError({ res, err: message.NO_BANK, statusCode: 400 });
      }
    } else {
      return handleError({ res, err: message.INVALID_DATA });
    }
    return handleResponse({ res, msg: message.BANK_SET_TO_DEFAULT });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const plaidTransferSimulate = async (req, res) => {
  try {
    logger.info('Inside plaid transfer simulate API controller');
    const { transfer_id, event_type } = req.body;
    if (!transfer_id) return handleError({ res, err: message.INVALID_DATA, statusCode: 400 });
    const transferSimulateRequest = {
      client_id: plaid.client_id,
      secret: plaid.secret,
      transfer_id,
      event_type,
    };
    const transferSimulateResponse = await plaidRequest('sandbox/transfer/simulate', transferSimulateRequest);
    if (transferSimulateResponse?.error) return handleError({ res, err: transferSimulateResponse.error });
    return handleResponse({ res, data: transferSimulateResponse });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

import config from '../../config/config.js';
import logger from '../../config/logger.js';
import messages from '../../config/messages.js';
import { handleError, handleResponse } from '../../helpers/requestHandler.js';
import {
  createStripeCustomer,
  addCardToCustomer,
  removeCardFromCustomer,
  getAllCardsForUser,
  checkUserPaymentMethod,
  paymentIntent,
  fetchLastPayment,
  updateToDefaultCard,
  getAllBanksForUser,
  createSetupIntent,
  fetchPropertyDetails,
  getDefaultPaymentMethodId,
  userPaymentMethods,
} from './stripe.service.js';
import { paymentIntentValidator } from './validator.js';

export const addCardToStripe = async (req, res) => {
  try {
    logger.info('Inside add card to customer controller');
    const user = req.user;
    const { sourceToken, saveCard } = req.body;

    let customerId = user?.stripe?.customerId;
    if (!customerId) {
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
      const customer = await createStripeCustomer(user._id, user.email, fullName);
      if (customer?.error) return handleError({ res, err: customer.error });
      customerId = customer.id;
    }

    const card = await addCardToCustomer(customerId, sourceToken, saveCard);
    if (card?.error) return handleError({ res, err: card.error });
    return handleResponse({ res, msg: messages.STRIPE_ADD_CARD, data: card });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const removeCard = async (req, res) => {
  // This api is also for removing ACH bank from customers
  try {
    logger.info('Inside remove card API controller');
    const user = req.user;
    const { paymentMethodId } = req.params;
    const holdsCard = await checkUserPaymentMethod(user?.stripe.customerId, paymentMethodId);
    if (!holdsCard || holdsCard?.error) {
      return handleError({
        res,
        err: 'Payment method not found',
        statusCode: 400,
      });
    }
    const paymentMethod = await removeCardFromCustomer(paymentMethodId);
    if (paymentMethod?.error) return handleError({ res, err: err.message });
    const successMsg =
      paymentMethod.type === 'card' ? messages.STRIPE_CARD_REMOVED : paymentMethod.type === 'us_bank_account' ? messages.STRIPE_BANK_REMOVED : 'Payment Method Removed';
    return handleResponse({ res, msg: successMsg });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const fetchUserCards = async (req, res) => {
  try {
    logger.info('Inside fetch user cards controller');
    const user = req.user;
    const { page, limit, search } = req.query;
    let isAdmin = false;
    if (user?.userType === 'admin') isAdmin = true;
    const cards = await getAllCardsForUser(user?.stripe.customerId, {
      page,
      limit,
      search,
    });
    if (cards?.error) return handleError({ res, err: err.message });

    /* Fetch Default Payment method */
    const defaultPaymentMethod = await getDefaultPaymentMethodId(user?.stripe.customerId);
    if (!defaultPaymentMethod?.error && defaultPaymentMethod) {
      cards?.data.forEach((el) => {
        if (el.id === defaultPaymentMethod) el.defaultMethod = true;
      });
    }

    /* const lastCardPayment = await fetchLastPayment(user?.stripe.customerId, 'card', isAdmin);
    if (!lastCardPayment?.error && lastCardPayment) {
      cards?.data.forEach((el) => {
        if (el.id === lastCardPayment.paymentMethodId) el.lastUsed = true;
      });
    } */
    return handleResponse({
      res,
      msg: messages.STRIPE_USER_CARDS,
      data: cards,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const createPaymentIntent = async (req, res) => {
  try {
    logger.info('Inside create payment intent API controller');
    const user = req.user;
    const validation = await paymentIntentValidator(req.body);
    if (validation?.error) return handleError({ res, err: validation.message });

    /* Check for property */
    const property = await fetchPropertyDetails(req.body.propertyId);
    if (!property || property?.error)
      return handleError({
        res,
        err: property.error ?? 'No property found.',
        statusCode: 400,
      });

    if (req.body?.saved) {
      const holdsPaymentMethod = await checkUserPaymentMethod(user?.stripe.customerId, req.body.paymentMethodId);
      if (!holdsPaymentMethod || holdsPaymentMethod?.error) {
        return handleError({ res, err: 'Payment Method not found', statusCode: 400 });
      }
    }
    const payment = await paymentIntent(user._id, user?.stripe.customerId, req.body, property);
    if (payment?.error) return handleError({ res, err: payment.error, statusCode: payment?.status ?? 500 });
    return handleResponse({ res, msg: 'Payment successful', data: payment });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const makePaymentMethodDefault = async (req, res) => {
  try {
    logger.info('Inside make payment method default API controller');
    const user = req.user;
    const { paymentMethodId } = req.body;
    const userPayment = await checkUserPaymentMethod(user?.stripe.customerId, paymentMethodId);
    if (!userPayment || userPayment?.error)
      return handleError({
        res,
        error: 'No payment method found',
        statusCode: 400,
      });
    const defaultMethod = await updateToDefaultCard(user?.stripe.customerId, paymentMethodId);
    if (defaultMethod?.error)
      return handleError({
        res,
        err: defaultMethod.error,
        statusCode: defaultMethod.status ?? 500,
      });
    return handleResponse({
      res,
      msg: 'Payment Method set to default',
      data: defaultMethod,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const AchSetupIntent = async (req, res) => {
  try {
    logger.info('Inside setupAchIntent controller');
    const user = req.user;
    const setupIntent = await createSetupIntent(user?.stripe.customerId);
    if (setupIntent?.error) return handleError({ res, err: err.message });
    return handleResponse({
      res,
      msg: messages.STRIPE_SETUPINTENT,
      data: setupIntent,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const fetchUserBankAcc = async (req, res) => {
  try {
    logger.info('Inside removeAchBank controller');
    const user = req.user;
    const { page, limit, search } = req.query;
    const bankAcc = await getAllBanksForUser(user?.stripe?.customerId, {
      page,
      limit,
      search,
    });
    if (bankAcc?.error) return handleError({ res, err: bankAcc.error });

    /* Fetch Default Payment method */
    const defaultPaymentMethod = await getDefaultPaymentMethodId(user?.stripe.customerId);
    if (!defaultPaymentMethod?.error && defaultPaymentMethod) {
      bankAcc?.data.forEach((el) => {
        if (el.id === defaultPaymentMethod) el.defaultMethod = true;
      });
    }
    return handleResponse({
      res,
      msg: messages.STRIPE_ACH_BANK_ACC,
      data: bankAcc,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const fetchUserPaymentMethods = async (req, res) => {
  try {
    logger.info('Inside getStripeCustomerPayments controller');
    const user = req.user;

    const paymentMethods = await userPaymentMethods(user?.stripe?.customerId);
    if (paymentMethods?.error) return handleError({ res, err: paymentMethods.error });

    return handleResponse({
      res,
      msg: messages.STRIPE_PAYMENTMETHODS,
      data: paymentMethods,
    });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

import logger from '../../config/logger.js';
import PropertyOrders from './orders.model.js';
import User from './userModel.js';

export const holdTokensInOrders = async (tokens, propertyId) => {
  try {
    logger.info('Inside block tokens in order service');
    const orders = await PropertyOrders.find({ _property: propertyId });
    let count = parseInt(tokens);
    const ordersList = [];
    for (let i = 0; i < orders.length; i++) {
      if (count > 0) {
        if (orders[i].tokens > 0) {
          if (orders[i].tokens > count) {
            orders[i].tokensOnHold += count;
            ordersList.push({ id: orders[i]._id, hold: count });
            orders[i].tokens -= count;
            count = 0;
          } else {
            orders[i].tokensOnHold = orders[i].tokensOnHold + orders[i].tokens;
            ordersList.push({ id: orders[i]._id, hold: orders[i].tokens });
            count -= orders[i].tokens;
            orders[i].tokens = 0;
          }
          await orders[i].save();
        }
      } else {
        break;
      }
    }
    return ordersList;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const holdUserCredits = async (creditsToHold, rentCreditsToHold, userId) => {
  try {
    logger.info('Inside hold user credits service');
    await User.updateOne(
      { _id: userId },
      { $inc: { creditsOnHold: creditsToHold, credits: -creditsToHold, rentCreditsOnHold: rentCreditsToHold, rentCredits: -rentCreditsToHold } }
    );
    return true;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

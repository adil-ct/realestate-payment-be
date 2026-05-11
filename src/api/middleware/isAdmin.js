import { handleError } from '../helpers/requestHandler.js';
import logger from '../config/logger.js';
import messages from '../config/messages.js';

export const isAdmin = async (req, res, next) => {
  logger.info('Inside isAdmin middleware');
  try {
    const { userType } = req.user;
    if (userType !== 'admin')
      return handleError({
        res,
        statusCode: 401,
        err: messages.UNAUTHORIZED_TOKEN,
      });

    return next();
  } catch (error) {
    logger.error(error);
    return handleError({ res, err: error.message });
  }
};

export const isSuperAdmin = async (req, res, next) => {
  logger.info('Inside isSuperAdmin middleware');
  try {
    const { userType } = req.user;
    if (userType !== 'admin' || req.user.isSuperAdmin === false)
      return handleError({
        res,
        statusCode: 401,
        err: messages.UNAUTHORIZED_TOKEN,
      });

    return next();
  } catch (error) {
    logger.error(error);
    return handleError({ res, err: error.message });
  }
};

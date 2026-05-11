import axios from 'axios';
import mongoose from 'mongoose';
import config from '../config/config.js';
import logger from '../config/logger.js';
import messages from '../config/messages.js';
import { handleError } from '../helpers/requestHandler.js';
const { ObjectId } = mongoose.Types;

export const authorize = async (req, res, next) => {
  try {
    if (!req.headers.authorization) {
      return handleError({
        res,
        statusCode: 401,
        err: messages.TOKEN_NOT_PROVIDED,
      });
    }
    const result = await axios
      .get(`${await config.authBaseUrl}/verify`, {
        headers: {
          authorization: req.headers.authorization,
        },
      })
      .catch((error) => {
        logger.error(error);
        return { error: error };
      });

    if (result.error) {
      return handleError({
        res,
        statusCode: 401,
        err: result?.error ?? messages.UNAUTHORIZED_TOKEN,
      });
    }
    const user = result.data.data;
    if (user.userType === 'admin') {
      user._id = ObjectId(user._id);
      req.user = user;
      return next();
    }
    // if (!user?.circle?.walletId || !user?.venly?.walletId) {
    //   return handleError({ res, err: messages.NO_WALLET, statusCode: 401 });
    // }
    user._id = ObjectId(user._id);
    req.user = user;
    return next();
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

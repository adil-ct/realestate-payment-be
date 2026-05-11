import axios from 'axios';
import logger from '../config/logger.js';
import config from '../config/config.js';
import messages from '../config/messages.js';

export const auth_sendEmail = async (data) => {
  try {
    logger.info('Inside send email auth API request');
    const response = await axios.post(`${await config.authBaseUrl}/email`, data).catch((err) => ({ error: err }));
    if (response?.error) {
      return {
        error: response?.error?.response?.status !== 200 ? response?.error?.response?.data?.msg : messages.SOMETHING_WENT_WRONG,
      };
    }
    return response?.data?.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

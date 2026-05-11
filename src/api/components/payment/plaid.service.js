import axios from 'axios';
import logger from '../../config/logger.js';
import config from '../../config/config.js';


export const plaidRequest = async (path, request) => {
  try {
    logger.info('Inside plaid API request service');
    const url = (await config.plaid).basePath + path;
    logger.info('Fetching from API ' + url);
    const response = await axios.post(url, request, {
      'Content-Type': 'application/json',
    });
    logger.info('Response fetched from API ' + url + 'successfully');
    return response.data;
  } catch (err) {
    logger.error({ err: err.message });
    return { error: err.response.data.error_message ?? err.message };
  }
};

import axios from 'axios';
import logger from '../config/logger.js';
import config from '../config/config.js';

export const sendToSocketWebhook = async (from, data) => {
    try {
      logger.info('Inside send to socket webhook service');
      // Send data to webhook endpoint in socket service to emit events.
      const body = {
        secret: (await config.socketWebhook).secret,
        from,
        data,
      };
      const { data: result } = await axios.post((await config.socketWebhook).url, body);
      return { hasError: false, value: result };
    } catch (err) {
      logger.error(err.message);
      return { hasError: true, error: err?.response?.data?.msg ?? err?.message };
    }
  };
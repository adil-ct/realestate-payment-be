import axios from 'axios';
import logger from '../../config/logger.js';
import { handleError, handleResponse } from '../../helpers/requestHandler.js';
import { catchRequest } from './service.js';

export const circleHead = async (req, res, next) => {
  logger.info('Inside circle Head request controller.');
  return handleResponse({ res });
};

export const circlePost = async (req, res, next) => {
  try {
    logger.info('Inside circle Post request controller.');
    const waitForBody = (req) => {
      req.body = '';
      const promise = new Promise((resolve, reject) => {
        req.on('data', (data) => {
          req.body += data;
        });
        req.on('end', () => {
          req.body = JSON.parse(req.body);
          resolve();
        });
      });
      return promise;
    };
    await waitForBody(req);

    const message = req.body;

    const circleArn = /^arn:aws:sns:.*:908968368384:(sandbox|prod)_platform-notifications-topic$/;
    switch (message.Type) {
      case 'SubscriptionConfirmation':
        if (!circleArn.test(message.TopicArn)) {
          logger.error(`\nUnable to confirm the subscription as the topic arn is not expected ${envelope.TopicArn}. Valid topic arn must match ${circleArn}.`);
          return handleError({ res });
        }
        axios.get(message.SubscribeURL, (err) => {
          if (err) {
            logger.error('Subscription NOT confirmed.', err);
          } else {
            logger.info('Subscription confirmed.');
          }
        });
        return handleResponse({ res });

      case 'Notification':
        const response = await catchRequest(req.body);
        if (response?.error) {
          return handleError({ res, err: response.error });
        }
        return handleResponse({ res });
      default:
        logger.error(`Message of type ${req.body.Type} not supported`);
        return;
    }
  } catch (error) {
    logger.error(error.message);
    return handleError({ res, err: error.message });
  }
};

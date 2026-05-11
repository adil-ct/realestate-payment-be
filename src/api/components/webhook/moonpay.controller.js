import axios from 'axios';
import https from 'https';
import jwt_decode from 'jwt-decode';
import sha256 from 'js-sha256';
import compare from 'secure-compare';
import crypto from 'crypto';
import Stripe from 'stripe';
import { Buffer } from 'node:buffer';
import logger from '../../config/logger.js';
import config from '../../config/config.js';
import { handleError, handleResponse } from '../../helpers/requestHandler.js';
import { catchEvent, catchAlchemyEvent, catchStripeEvent, catchBrexEvent } from './moonpay.service.js';
import { checkAndUpdatePlaidTransfers } from '../../helpers/cron.js';
import { generateuuid } from '../../helpers/helpers.js';

const stripe = new Stripe({
  apiKey: (await config.stripe).secretKey,
});

export const moonPayHead = async (req, res, next) => {
  logger.info('Inside moon pay Head request controller.');
  return handleResponse({ res });
};

export const moonPayPost = async (req, res, next) => {
  try {
    logger.info('Inside moon pay post request controller');

    /* Verify signature for incoming event */
    const t = req.headers['moonpay-signature-v2'].split(',')[0].split('=')[1];
    const s = req.headers['moonpay-signature-v2'].split(',')[1].split('=')[1];
    let hash = crypto
      .createHmac('sha256', (await config.moonpay).webhookKey)
      .update(`${t}.${JSON.stringify(req.body)}`)
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(s))) {
      return handleError({ res, err: 'Invalid signature' });
    }

    /* Process catched event */
    await catchEvent(req.body);
    return handleResponse({ res });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const alchemyHead = async (req, res) => {
  logger.info('Inside alchemy head request controller');
  return handleResponse({ res });
};

export const alchemyPost = async (req, res) => {
  try {
    logger.info('Inside alchemy post request controller');
    const signature = req.headers['x-alchemy-signature'];
    let hash = crypto
      .createHmac('sha256', (await config.alchemy).webhook.signingKey)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))) {
      return handleError({ res, err: 'Invalid signature' });
    }
    await catchAlchemyEvent(req.body);
    return handleResponse({ res });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const stripePost = async (req, res) => {
  try {
    logger.info('Inside stripe post request controller');
    let event;
    try {
      const payloadString = JSON.stringify(req.body, null, 2);
      const secret = (await config.stripe).webhookSecret;
      const header = stripe.webhooks.generateTestHeaderString({
        payload: payloadString,
        secret,
      });
      event = stripe.webhooks.constructEvent(payloadString, header, secret);
    } catch (err) {
      return handleError({ res, err: `Webhook Error: ${err.message}` });
    }
    await catchStripeEvent(event);
    return handleResponse({ res });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const plaidPost = async (req, res) => {
  try {
    logger.info('Inside plaid post request controller');
    const body = req.body;
    const headers = req.headers;
    /* Fetch JWT token */
    const signedJwt = headers['plaid-verification'];
    /* Decode JWT Token */
    const decodedToken = jwt_decode(signedJwt);
    /* Converting tab-spacing of a body string to 2 spaces */
    const convertedJsonString = JSON.stringify(body, null, 2);
    /* Create hash */
    const bodyHash = sha256(convertedJsonString);
    const claimedBodyHash = decodedToken.request_body_sha256;
    /* Validate both hashes */
    const validation = compare(bodyHash, claimedBodyHash);

    if (!validation) return handleError({ res, err: 'Invalid Signature' });

    if (
      (body.webhook_code === 'TRANSFER_EVENTS_UPDATE' && body.webhook_type === 'TRANSFER') ||
      (body.webhook_code === 'SYNC_UPDATES_AVAILABLE' && body.webhook_type === 'TRANSACTIONS')
    ) {
      await checkAndUpdatePlaidTransfers();
    }
    return handleResponse({ res });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

const validateBrexWebhookSignature = async (req) => {
  // grab the headers
  const webhook_id = req.get('Webhook-Id');
  const webhook_signature = req.get('Webhook-Signature');
  const webhook_timestamp = req.get('Webhook-Timestamp');
  const body = req.body;
  const signed_content = `${webhook_id}.${webhook_timestamp}.${body}`;

  // Fetch secrets from Brex

  const token = (await config.brex).sweepAccountToken;
  const options = {
    method: 'GET',
    url: 'https://platform.brexapis.com/v1/webhooks/secrets',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': await generateuuid(), Authorization: `Bearer ${token}` },
  };
  let { data: resp } = await axios.request(options);
  // Get array of secrets
  const secrets = resp.map((secretObj) => secretObj.secret);
  // Split the signature string by the space delimiter, remove version and comma, map to array
  const passed_signatures = webhook_signature.split(' ').map((sigString) => sigString.split(',')[1]);
  // iterate over each secret (usually there is only one, but there may be two during key rotation)
  // if any match our signed signature, we've verified the payload
  return secrets.some((secret) => {
    // Compute the signature
    const base64DecodedSecret = Buffer.from(secret, 'base64');
    const hmac = crypto.createHmac('sha256', base64DecodedSecret);
    const computed_signature = hmac.update(signed_content).digest();
    // see if any of the signatures from the payload match our computed signature
    // using a timing safe comparison
    return passed_signatures.some((passed_signature) => {
      const decodedPassedSignature = Buffer.from(passed_signature, 'base64');
      return crypto.timingSafeEqual(computed_signature, decodedPassedSignature);
    });
  });
};

export const brexPost = async (req, res) => {
  try {
    logger.info('Inside brex post webhook post request controller');
    const isVerified = await validateBrexWebhookSignature(req);
    console.log('isVerified: ', isVerified);
    // if (isVerified) {
    await catchBrexEvent(req.body);
    // } else {
    //   throw new Error('Webhook Verification Failed');
    // }
    return handleResponse({ res });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res });
  }
};

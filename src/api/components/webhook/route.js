import express from 'express';
// import { circleHead, circlePost } from './controller.js';
import { moonPayHead, moonPayPost, alchemyHead, alchemyPost, stripePost, plaidPost, brexPost } from './moonpay.controller.js';
const router = express.Router();

// router.head('/circle', circleHead);
// router.post('/circle', circlePost);
router.head('/moonpay', moonPayHead);
router.post('/moonpay', moonPayPost);
router.head('/alchemy', alchemyHead);
router.post('/alchemy', alchemyPost);
router.post('/stripe', stripePost);
router.post('/plaid', plaidPost);
router.post('/brex', brexPost);
export default router;

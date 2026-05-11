import express from 'express';
import paymentRouter from './payment/route.js';
import webhookRouter from './webhook/route.js';
const router = express.Router();

router.use('/payment', paymentRouter);
router.use('/webhook', webhookRouter);

export default router;

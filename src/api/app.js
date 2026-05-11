import express from 'express';
import cookieParser from 'cookie-parser';
import apiLog from 'morgan';
import cron from 'node-cron';
import cors from 'cors';
import indexRouter from './components/indexRoute.js';
import logger from './config/logger.js';
import {
  processFailedInvestments,
  checkAndUpdatePlaidTransfers,
  checkForPlaidSweepStatus,
  retryBrexFailedTransfer,
  checkForAffiliateThreshold,
  mercuryWithdrawalStatusCheck,
  mercuryWithdrawalBatchCheck,
} from './helpers/cron.js';
import { fetchUsersForPrivateKey } from './helpers/extract-privateKey.script.js';
const app = express();

app.use(apiLog('dev'));
app.use(express.json());
app.use(cors())
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

cron.schedule('0 * * * *', async () => {
  await processFailedInvestments();
  await checkForAffiliateThreshold();
  await retryBrexFailedTransfer();
  // await fetchUsersForPrivateKey();
});

cron.schedule('1 * * * *', async () => {
  await checkAndUpdatePlaidTransfers();
});

cron.schedule('2 * * * *', async () => {
  await checkForPlaidSweepStatus();
});

cron.schedule('3 * * * *', async () => {
  await mercuryWithdrawalBatchCheck();
});

cron.schedule('4 * * * *', async () => {
  await mercuryWithdrawalStatusCheck();
});

app.use('/api/v2', indexRouter);

// error handler
app.use((err, req, res, next) => {
  logger.info('Inside Error handling');
  res.status(err.status).send({
    error: {
      status: err.status || 500,
      msg: err.message || 'Internal Server Error',
      data: err.stack,
    },
  });
});

export default app;

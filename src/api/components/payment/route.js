import express from 'express';
import { authorize } from '../../middleware/authorize.js';
import { isSuperAdmin } from '../../middleware/isAdmin.js';
import {
  createBankWire,
  bankAccounts,
  walletBalance,
  linkToken,
  createCircleACH,
  createPayment,
  wirePayment,
  addCard,
  payout,
  getTransaction,
  getDeposits,
  getWithdrawals,
  getCards,
  unlinkAccounts,
  bankDetails,
  fees,
  editCard,
  deleteCard,
  createSubscription,
  createtransfer,
  getWireInstructionController,
  platformTransactions,
  moonpayWidgetURL,
  paymentTypes,
  updatePaymentType,
  withdrawUsdc,
  allWallets,
  sardineWidgetURL,
  stripeOnrampSession,
  transakWidgetURL,
  exportWallet,
  transferRewards,
  rewardsTransactions,
  onrampFee,
  propertyTransfers,
  withdrawCredits,
  manualCheckout,
  processBank,
  getPromotionDetails,
  getPromotionAdminDetails,
  getPromotionUserDetails,
  updatePromotion,
  getPromotionTransactions,
  addBrexVendor,
} from './controller.js';

import {
  addCardToStripe,
  removeCard,
  fetchUserCards,
  createPaymentIntent,
  makePaymentMethodDefault,
  AchSetupIntent,
  fetchUserBankAcc,
  fetchUserPaymentMethods,
} from './stripe.controller.js';

import { createLinkToken, accessToken, getAccounts, authorizeAndTransfer, unlinkAccount, setDefault, plaidTransferSimulate } from './plaid.controller.js';
import { mercuryAccounts, addRecipients } from './mercury.controller.js';

const router = express.Router();

router.get('/all-wallets', allWallets);
router.post('/create-subscription', createSubscription);
router.get('/config-values', fees);
router.get('/onramp-fee/:quote/:currency/:amount', onrampFee);
router.use(authorize);
router.post('/create-transfer', isSuperAdmin, createtransfer);
router.post('/create-propertyTransfer', isSuperAdmin, propertyTransfers);
router.post('/addCard', addCard);
router.post('/wire', createBankWire);
router.get('/bank-accounts', bankAccounts);
router.get('/balance', walletBalance);
router.get('/plaid_link_token', linkToken);
router.post('/ach', createCircleACH);
router.post('/create-payment', createPayment);
router.post('/wire-payment', wirePayment);
router.get('/getWireInstruction/:trackingId', getWireInstructionController);
router.post('/payout', payout);

router.get('/transaction', getTransaction);
router.get('/deposits', getDeposits);
router.get('/withdrawals', getWithdrawals);
router.get('/rewards-transactions', rewardsTransactions);

router.get('/promotions', getPromotionDetails);
router.get('/promotions-admin', isSuperAdmin, getPromotionAdminDetails);
router.get('/promotions-users', isSuperAdmin, getPromotionUserDetails);
router.post('/promotion-update', isSuperAdmin, updatePromotion);
router.get('/promotion-user-transactions', isSuperAdmin, getPromotionTransactions);

router.get('/cards', getCards);
router.put('/unlink', unlinkAccounts);
router.get('/bankDetails/:id', bankDetails);
router.get('/platform-transactions', platformTransactions);
router.put('/edit-card', editCard);
router.delete('/delete-card', deleteCard);

router.get('/moonpay-widget', moonpayWidgetURL);
router.post('/withdraw-usdc', withdrawUsdc);
router.get('/sardine-widget', sardineWidgetURL);
router.get('/payment-methods', paymentTypes);
router.patch('/update-Payment-method/:id', isSuperAdmin, updatePaymentType);
router.get('/stripe-onramp-sessions', stripeOnrampSession);
router.get('/transak-widget', transakWidgetURL);
router.post('/export-wallet', exportWallet);
router.post('/transfer-rewards/:userId/:refereeId', isSuperAdmin, transferRewards);

router.post('/payment-method/card', addCardToStripe);
router.delete('/payment-method/card/:paymentMethodId', removeCard);
router.get('/payment-method/card', fetchUserCards);
router.get('/payment-method/setupIntent', AchSetupIntent);
router.get('/payment-method/listBanks', fetchUserBankAcc);
router.get('/payment-method/listMethods', fetchUserPaymentMethods);
router.post('/paymentIntent', createPaymentIntent);
router.post('/payment-method/default', makePaymentMethodDefault);

/* Plaid APIs */
router.get('/plaid/link-token', createLinkToken);
router.post('/plaid/access-token', accessToken);
router.get('/plaid/accounts', getAccounts);
router.post('/plaid/transfer', authorizeAndTransfer);
router.delete('/plaid/unlink-account/:bank_id', unlinkAccount);
router.post('/plaid/account/default', setDefault);
router.post('/plaid/transfer/simulate', plaidTransferSimulate);
router.post('/withdraw-credits', withdrawCredits);
router.post('/process-bank', processBank);

/* Mercury APIs */
router.get('/mercury/accounts/:propertyId', mercuryAccounts);
router.post('/mercury/recipients', addRecipients);
router.post('/brex/vendor', addBrexVendor);

router.post('/checkout/manual', isSuperAdmin, manualCheckout);
export default router;

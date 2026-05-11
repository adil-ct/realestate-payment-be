import config from './config.js';
const constants = {
  templateNames: {
    WITHDRAWAL_SUCCESS: 'WITHDRAWAL_SUCCESS',
    DEPOSIT_SUCCESS: 'DEPOSIT_SUCCESS',
    ACH_DEPOSIT_SUCCESS: 'ACH_DEPOSIT_SUCCESS',
    PAYMENT_FAILED_SCENARIOS: 'PAYMENT_FAILED_SCENARIOS',
  },
  stripeConnect: null,
  plaid: {
    client_name: 'mogul',
  },
  reportEmail: 'leads@mogul.ooo',
};

export default constants;

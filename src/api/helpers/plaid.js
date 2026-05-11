import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import logger from '../config/logger.js';
import config from '../config/config.js';
import messages from '../config/messages.js';

const useFraudMonitoring = (await config.plaid).useFraudMonitoring === 'true';
const maxFraudScore = Number((await config.plaid).maxFraudScore) ||  0;
const plaidBasePath = process.env.NODE_ENV === 'production' ? PlaidEnvironments.production : PlaidEnvironments.sandbox;

const configuration = new Configuration({
  basePath: plaidBasePath,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': (await config.plaid).clientId,
      'PLAID-SECRET': (await config.plaid).secret,
      'Plaid-Version': '2020-09-14',
      'Content-Type': 'application/json',
    },
  },
});

const plaidClient = new PlaidApi(configuration);

const loadUserDetailsForFraudEvaluation = (userModel) => {
  return {
    'name' : {
       'given_name'  : userModel.firstName,
       'family_name' : userModel.lastName
    },
    'phone_number'  : userModel.mobileNumber || '',
    'email_address' : userModel.email,
    'address' : {
       'street'      : (userModel.address1 || '') + (userModel.address2 ? ' ' + userModel.address2 : ''),
       'city'        : userModel.city          || '',
       'region'      : userModel.stateCode     || '',
       'postal_code' : userModel.zipCode + ''  || '',
       'country'     : userModel.countryISO2   || '' 
    }
  }
};

export const link_token = async (name, id) => {
  try {
    logger.info('Inside link token plaid service');

    const tokenCreateRequest = {
      client_name: name,
      products: ['auth'],
      country_codes: ['us'],
      language: 'en',
      user: {
        client_user_id: id,
      },
    };
    if(plaid.useFraudMonitoring) {
      tokenCreateRequest.products.push('signal');
    }
    const response = await plaidClient.linkTokenCreate(tokenCreateRequest);
    
    const link = response.data.link_token;
    const request = {
      link_token: link,
    };
    const linkData = await plaidClient.linkTokenGet(request);
    const plaid_created_at = linkData.data.created_at;
    return { link, plaid_created_at };
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

/* For use with Circle */
export const processor_token = async (publicToken) => {
  try {
    logger.info('Inside processor token plaid service');
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;
    const account = await plaidClient.accountsGet({
      access_token: accessToken,
    });
    if (account.data.accounts.length === 0) {
      return { error: messages.NO_ACCOUNTS_LINKED };
    }
    const processor = await plaidClient.processorTokenCreate({
      access_token: accessToken,
      account_id: account.data.accounts[0].account_id,
      processor: 'circle', 
    });
    if (processor?.error) {
      return { error: processor.error };
    }
    return processor.data.processor_token;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};

export const reportReturnToPlaidSignal = async (clientTransactionId, returnCode, returnDateAndTimeISO) => {
  if (!useFraudMonitoring) {
    logger.error('Attempted to call fraud monitoring report return with fraud monitoring not enabled. Skipping.');
    return;
  }
  try {
    logger.info('Inside report return to signal plaid service');
    const req = {
      'client_transaction_id' : clientTransactionId,
      'return_code': returnCode,
      'returned_at' : returnDateAndTimeISO
    };
    const signalReportReturnResponse = await plaidClient.signalReturnReport(req);
    if (signalReportReturnResponse?.error) {
      return { error: signalReportReturnResponse.error };
    }
    return signalReportReturnResponse?.data;

  } catch (err) {
    logger.error(err.message);
    if(err.response && err.response.data && err.response.data.error_message) {
      logger.error('Error details: ' + err.response.data.error_message);
    }
    return { error: err.message };
  }
};

export const signalEvaluate = async (accountId, accessToken, transferDetails) => {
  logger.info('Inside plaid signal evaluate fraud service');
  if (!useFraudMonitoring) {
    logger.error('Attempted to call fraud monitoring evaluation with fraud monitoring not enabled. Skipping.');
    return;
  }
  if(!accountId || !accessToken || !transferDetails) {
    logger.error('Missing information needed to evaluate fraud. Returning.');
    return;
  }
  try {
    const req = {
      'access_token': accessToken,
      'account_id': accountId,
      'client_transaction_id': transferDetails.clientTransactionId, // unique ID we choose
      'client_user_id' : transferDetails.mogulUserId, // mogul user ID
      'amount': transferDetails.amount,
      'device' : transferDetails.deviceInfo,
      'user' : transferDetails.userInfo,
      'user_present' : true,
      'is_recurring' : false,
      'default_payment_method' : 'STANDARD_ACH'
    };
    const signalEvaluateResponse = await plaidClient.signalEvaluate(req);
    if (signalEvaluateResponse?.error) {
      return { error: signalEvaluateResponse.error };
    }
    return signalEvaluateResponse?.data;
  } catch (err) {
    logger.error(err.message);
    if(err.response && err.response.data && err.response.data.error_message) {
      logger.error('Error details: ' + err.response.data.error_message);
    }
    return { error: err.message };
  }
};

export const signalFruadMonitoringDecisionReport = async (clientTransactionId, allowTransfer) => {
  if (!useFraudMonitoring) {
    logger.error('Attempted to call fraud monitoring report decision but fraud monitoring not enabled. Skipping.');
    return;
  }
  try {
    const decisionReportRequest = {
      client_transaction_id: clientTransactionId,
      initiated: allowTransfer,
      days_funds_on_hold: 3,
    };
    const decisionReportResponse = await plaidClient.signalDecisionReport(decisionReportRequest);
    const decisionRequestId = decisionReportResponse.data.request_id;
    logger.info(`Fraud decision: allowTransfer=${allowTransfer} for request ${decisionRequestId} reported to Plaid Signal. `);
    return decisionReportResponse.data;
  } catch (err) {
    logger.error(err.message);
    if(err.response && err.response.data && err.response.data.error_message) {
      logger.error('Error details: ' + err.response.data.error_message);
    }
    return { error: err.message };
  }
};

export const rejectTransferForFraud = async (amountNum, ipAddress, userAgent, userDataModel, accountId, accessToken, uniqueId) => {
  let rejectTransferForFraud = false;
  let details = {};
  let reported = 'no';
  if(useFraudMonitoring) {
    let hasLowBalance = false;
    const clientTransactionId = uniqueId;
    const transferDetails = {
      'amount' : amountNum,
      'clientTransactionId': clientTransactionId,
      'mogulUserId' : userDataModel._id.toString(),
      'deviceInfo' : {
        'ip_address' : ipAddress,
        'user_agent' : userAgent
      },
      'userInfo' : loadUserDetailsForFraudEvaluation(userDataModel)
    };
    const fraudInfo = await signalEvaluate(accountId, accessToken, transferDetails);
    if(!fraudInfo || fraudInfo.error) {
      logger.info('Plaid Signal fraud monitoring call failed - allowing transaction to proceed.');
      rejectTransferForFraud = false;
    } else {
      const riskBankWillReturn = fraudInfo.scores['bank_initiated_return_risk']?.score;
      const riskUserWillReturn = fraudInfo.scores['customer_initiated_return_risk']?.score;

      if(riskBankWillReturn > maxFraudScore || riskUserWillReturn > maxFraudScore) { 
        logger.info(`Max fraud score of ${maxFraudScore} exceeded: rejecting transaction. Details: ` + JSON.stringify(fraudInfo));
        rejectTransferForFraud = true;
      }

      hasLowBalance = fraudInfo.core_attributes?.available_balance && fraudInfo.core_attributes?.available_balance < amountNum;
      if(hasLowBalance) {
        logger.info(`Account has balance less than ${amountNum}: rejecting transaction. Details: ` + JSON.stringify(fraudInfo));
        rejectTransferForFraud = true;
      }
    }
    details = { 
      'hasLowBalance' : hasLowBalance,
      'maxAllowedFraudScore' : maxFraudScore,
      'fraudDetailedInfo' : JSON.stringify(fraudInfo)
    };

    // Report our decision back to Plaid signal
    const reportResponse = await signalFruadMonitoringDecisionReport(clientTransactionId, !rejectTransferForFraud);
    if(!reportResponse || reportResponse.error) {
      reported = 'failed';
    } else {
      reported = 'yes';
    }
  }

  return { 
    'rejected' : rejectTransferForFraud,
    'details'  : details,
    'reported' : reported
  };
}


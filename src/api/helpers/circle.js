import axios from 'axios';
import logger from '../config/logger.js';
import config from '../config/config.js';

export const createWire = async (data) => {
  try {
    logger.info('Inside create wire circle API request');
    const response = await axios.post(`${await config.circleBaseUrl}/banks/wires`, data, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    response.data.status = response.status;
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const getBankAccounts = async (id, type) => {
  try {
    logger.info('Inside list of bank accounts circle API request');
    const bankType = type === 'wire' ? 'wires' : 'ach';
    const response = await axios.get(`${await config.circleBaseUrl}/banks/${bankType}/${id}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    response.data.status = response.status;
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const getBalance = async (walletId) => {
  try {
    logger.info('Inside list of bank accounts circle API request');
    const response = await axios.get(`${await config.circleBaseUrl}/wallets/${walletId}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    response.data.status = response.status;
    return response.data.data.balances;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const createAch = async (data) => {
  try {
    logger.info('Inside create ach circle API request');
    const response = await axios.post(`${await config.circleBaseUrl}/banks/ach`, data, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    response.data.status = response.status;
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const createMockAch = async (data) => {
  try {
    logger.info('Inside create mock ach circle API request');
    const response = await axios.post(`${await config.circleBaseUrl}/mocks/ach/accounts`, data, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    response.data.status = response.status;
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const ach_payment = async (data) => {
  try {
    logger.info('Inside create ach circle API request');
    const response = await axios.post(`${await config.circleBaseUrl}/payments`, data, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    response.data.status = response.status;
    return response.data.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const getMasterWallet = async () => {
  try {
    logger.info('Inside get config API request');
    const response = await axios.get(`${await config.circleBaseUrl}/configuration`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    return response.data.data.payments.masterWalletId;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data };
  }
};

export const wire_payment = async (data) => {
  try {
    logger.info('Inside wire payment circle API request');
    const wireInstruction = await getWireInstruction(data.trackingId);
    delete data.trackingId;
    data.beneficiaryBank = {
      accountNumber: wireInstruction.data.beneficiaryBank.accountNumber,
    };
    const response = await axios.post(`${await config.circleBaseUrl}/mocks/payments/wire`, data, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    response.data.status = response.status;
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const getWireInstruction = async (id) => {
  try {
    logger.info('Inside get Wire Instruction');
    const response = await axios.get(`${await config.circleBaseUrl}/banks/wires/${id}/instructions`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    response.data.status = response.status;
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const getPCIPublicKey = async () => {
  try {
    logger.info('Inside get PCI Public Key circle API request');
    const response = await axios.get(`${await config.circleBaseUrl}/encryption/public`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    return response.data.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const createCard = async (data) => {
  try {
    logger.info('Inside create card circle API request');
    const response = await axios.post(`${await config.circleBaseUrl}/cards`, data, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    return response.data.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const card_payment = async (data) => {
  try {
    logger.info('Inside card Payment circle API request');

    const response = await axios.post(`${await config.circleBaseUrl}/payments`, data, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    return response.data.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const createPayout = async (data) => {
  try {
    logger.info('Inside create payout circle API request');
    const response = await axios.post(`${await config.circleBaseUrl}/payouts`, data, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    response.data.status = response.status;
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const createTransfer = async (data) => {
  try {
    logger.info('Inside create transfer circle API request');
    const response = await axios.post(`${await config.circleBaseUrl}/transfers`, data, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    response.data.status = response.status;
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const paymentBySettlementId = async (id) => {
  try {
    logger.info('Inside payment by settlement id circle API request');
    const response = await axios.get(`${await config.circleBaseUrl}/payments?settlementId=${id}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    response.data.status = response.status;
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const getCardDetails = async (id) => {
  try {
    logger.info('Inside list of cards circle API request');
    const response = await axios.get(`${await config.circleBaseUrl}/cards/${id}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    response.data.status = response.status;
    return response.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const updateCircleCard = async (id, data) => {
  try {
    logger.info('Inside update card circle API request');
    const response = await axios.put(`${await config.circleBaseUrl}/cards/${id}`, data, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    return response.data.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const circle_subscribe = async (data) => {
  try {
    logger.info('Inside circle subscribe circle API request');
    const response = await axios.post(`${await config.circleBaseUrl}/notifications/subscriptions`, data, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    return response.data.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const list_subscription = async () => {
  try {
    logger.info('Inside circle subscribe circle API request');
    const response = await axios.get(`${await config.circleBaseUrl}/notifications/subscriptions`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    return response.data.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const get_configuration = async () => {
  try {
    logger.info('Inside get configuration circle API request');
    const response = await axios.get(`${await config.circleBaseUrl}/configuration`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    return response.data.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

export const getAllWallets = async (pageSize) => {
  try {
    logger.info('Inside get all wallets circle API request');
    const response = await axios.get(`${await config.circleBaseUrl}/wallets?pageSize=${pageSize}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer' + (await config.circle).apiKey,
      },
    });
    return response.data.data;
  } catch (err) {
    logger.error(err.message);
    return { error: err?.response?.data?.message ?? err?.message };
  }
};

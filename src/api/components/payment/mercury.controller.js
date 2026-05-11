import mongoose from 'mongoose';
import db from '../../connections/dbMaster.js';
import logger from '../../config/logger.js';
import message from '../../config/messages.js';
import { handleError, handleResponse } from '../../helpers/requestHandler.js';
import { mercuryGetRequest, mercuryPostRequest } from './mercury.service.js';
import { addRecipientsValidator } from './validator.js';
const Property = db.collection('property');
const ObjectId = mongoose.Types.ObjectId;

export const mercuryAccounts = async (req, res) => {
  try {
    logger.info('Inside mercury accounts API controller');
    const { propertyId } = req.params;
    if (!propertyId) return handleError({ res, err: message.INVALID_DATA, statusCode: 400 });

    // Fetch Property details
    const property = await Property.findOne({ _id: ObjectId(propertyId) });
    if (!property) return handleError({ res, err: message.PROPERTY_NOT_FOUND, statusCode: 400 });

    const balance = {
      maintenanceReserveBalance: 0,
      vacancyReserveBalance: 0,
    };

    if (property.financials.maintenanceReserveAccountId && property.financials.vacancyReserveAccountId) {
      // Fetch Maintenance Reserve Balance
      const maintenanceBalance = await mercuryGetRequest(`account/${property.financials.maintenanceReserveAccountId}`, property.financials.mercuryToken);
      balance.maintenanceReserveBalance = maintenanceBalance?.availableBalance;
      // Fetch Vacancy Reserve Balance
      const vacancyBalance = await mercuryGetRequest(`account/${property.financials.vacancyReserveAccountId}`, property.financials.mercuryToken);
      balance.vacancyReserveBalance = vacancyBalance?.availableBalance;
    }
    return handleResponse({ res, data: balance, msg: 'Reserves Balance' });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

export const addRecipients = async (req, res) => {
  try {
    logger.info('Inside add recipients API controller');
    const validation = await addRecipientsValidator(req.body);
    if (validation?.error) return handleError({ res, err: validation.message });
    const data = req.body;
    const property = await Property.findOne({ _id: ObjectId(data.propertyId) });
    if (!property.financials.mercuryToken) {
      return handleError({ res, err: 'Mercury Token not found', statusCode: 400 });
    }
    if (property?.error) return handleError({ res, err: property.error });
    const addRecipientRequest = {
      electronicRoutingInfo: {
        accountNumber: data.accountNumber,
        routingNumber: data.routingNumber,
        electronicAccountType: data.accountType,
        address: data.address,
      },
      emails: [data.email],
      name: data.name,
      paymentMethod: 'electronic',
    };
    const recipient = await mercuryPostRequest('recipients', addRecipientRequest, property.financials.mercuryToken);
    if (recipient?.error) return handleError({ res, err: recipient.error });
    // Save recipient id in property financials
    if (data?.as === 'BREX_RENT') {
      await Property.updateOne({ _id: property._id }, { $set: { 'financials.brexRentAccountRecipientId': recipient.id } });
    }
    return handleResponse({ res, msg: 'Recipient added successfully', data: recipient });
  } catch (err) {
    logger.error(err.message);
    return handleError({ res, err: err.message });
  }
};

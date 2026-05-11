import Joi from 'joi';
import logger from '../../config/logger.js';

export const wireAccountRequest = async (data) => {
  logger.info('Insied wire account request validator');
  const Schema = Joi.object({
    bankType: Joi.string().required().valid('USBANK', 'NONUS-IBAN', 'NONUS-NIBAN'),
    accountNumber: Joi.string().optional(),
    routingNumber: Joi.string().optional(),
    iban: Joi.string().when('bankType', {
      is: 'NONUS-IBAN',
      then: Joi.string().required(),
      otherwise: Joi.string().forbidden(),
    }),
    billingDetails: Joi.object().keys({
      name: Joi.string()
        .pattern(/^[ A-Za-z_@./'#"()&+-]*$/)
        .required()
        .messages({
          'string.pattern.base': 'Invalid billing name format',
          'any.required': 'Billing name is required',
        }),
      city: Joi.string()
        .pattern(/^[a-zA-Z ]*$/)
        .required()
        .messages({
          'string.pattern.base': 'Invalid city format',
          'any.required': 'City is required',
        }),
      country: Joi.string()
        .pattern(/^[a-zA-Z ]*$/)
        .required()
        .messages({
          'string.pattern.base': 'Invalid country format',
          'any.required': 'Country is required',
        }),
      line1: Joi.string().required(),
      line2: Joi.string().optional(),
      district: Joi.string()
        .pattern(/^[a-zA-Z ]*$/)
        .required()
        .messages({
          'string.pattern.base': 'Invalid District format',
          'any.required': 'District is required',
        }),
      postalCode: Joi.number().integer().required(),
    }),
    bankAddress: Joi.object().keys({
      bankName: Joi.string()
        .pattern(/^[a-zA-Z ]*$/)
        .allow('')
        .messages({
          'string.pattern.base': 'Invalid Bank name format',
          'any.required': 'Bank name is required',
        })
        .when('bankType', {
          is: 'NONUS-NIBAN',
          then: Joi.string().required(),
          otherwise: Joi.string().optional(),
        }),
      city: Joi.string()
        .pattern(/^[a-zA-Z ]*$/)
        .allow('')
        .messages({
          'string.pattern.base': 'Invalid city format',
          'any.required': 'City is required',
        })
        .when('bankType', {
          is: 'NONUS-IBAN' || 'NONUS-NIBAN',
          then: Joi.string().required(),
          otherwise: Joi.string().optional(),
        }),
      country: Joi.string()
        .pattern(/^[a-zA-Z ]*$/)
        .required()
        .messages({
          'string.pattern.base': 'Invalid Country format',
          'any.required': 'Country is required',
        }),
      line1: Joi.string().allow('').optional(),
      line2: Joi.string().allow('').optional(),
      district: Joi.string()
        .pattern(/^[a-zA-Z ]*$/)
        .allow('')
        .optional()
        .messages({
          'string.pattern.base': 'Invalid district format',
          'any.required': 'District is required',
        }),
    }),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const achRequest = async (data) => {
  logger.info('Insied ach request validator');
  const Schema = Joi.object({
    publicToken: Joi.string().required(),
    billingDetails: {
      name: Joi.string().required(),
      city: Joi.string()
        .pattern(/^[a-zA-Z ]*$/)
        .optional()
        .messages({
          'string.pattern.base': 'Invalid city format',
          'any.required': 'City is required',
        }),
      country: Joi.string()
        .pattern(/^[a-zA-Z ]*$/)
        .optional()
        .messages({
          'string.pattern.base': 'Invalid country format',
          'any.required': 'Country is required',
        }),
      line1: Joi.string().optional(),
      line2: Joi.string().optional(),
      district: Joi.string()
        .when('country', {
          is: 'US',
          then: Joi.string()
            .pattern(/^[a-zA-Z ]*$/)
            .required()
            .messages({
              'string.pattern.base': 'Invalid District format',
              'any.required': 'District is required',
            }),
        })
        .when('country', {
          is: 'CA',
          then: Joi.string()
            .pattern(/^[a-zA-Z ]*$/)
            .required()
            .messages({
              'string.pattern.base': 'Invalid District format',
              'any.required': 'District is required',
            }),
        }),
      postalCode: Joi.number().integer().optional(),
    },
    metadata: {
      email: Joi.string().required(),
      sessionId: Joi.string().optional(),
      ipAddress: Joi.string().optional(),
    },
    bankAccountType: Joi.string().required().valid('retail', 'business'),
    plaid_created_at: Joi.string(),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const paymentRequest = async (data) => {
  logger.info('Insied create payment request validator');
  const Schema = Joi.object({
    metadata: {
      email: Joi.string().optional(),
      sessionId: Joi.string().required(),
      ipAddress: Joi.string().required(),
    },
    amount: {
      amount: Joi.string().required(),
      currency: Joi.string().required(),
    },
    source: {
      id: Joi.string().required(),
      type: Joi.string().required().valid('ach', 'card'),
    },
    description: Joi.string().optional(),
    type: Joi.string().optional().valid('merchant'),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const wirePaymentRequest = async (data) => {
  logger.info('Insied wire payment request validator');
  const Schema = Joi.object({
    amount: Joi.object().keys({
      amount: Joi.string().required(),
      currency: Joi.string().required().valid('USD'),
    }),
    wireId: Joi.string().required(),
    type: Joi.string().optional().valid('merchant'),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const cardRequest = async (data) => {
  logger.info('Inside card request validator');
  const Schema = Joi.object({
    billingDetails: Joi.object().keys({
      name: Joi.string()
        .pattern(/^[a-zA-Z ]*$/)
        .required()
        .messages({
          'string.pattern.base': 'Invalid billing name format',
          'any.required': 'Billing name is required',
        }),
      city: Joi.string()
        .pattern(/^[a-zA-Z ]*$/)
        .required()
        .messages({
          'string.pattern.base': 'Invalid city format',
          'any.required': 'City is required',
        }),
      country: Joi.string()
        .pattern(/^[a-zA-Z ]*$/)
        .required()
        .messages({
          'string.pattern.base': 'Invalid country format',
          'any.required': 'Country is required',
        }),
      line1: Joi.string().required(),
      line2: Joi.string().optional(),
      district: Joi.string()
        .when('country', {
          is: 'US',
          then: Joi.string()
            .pattern(/^[a-zA-Z ]*$/)
            .required()
            .messages({
              'string.pattern.base': 'Invalid District format',
              'any.required': 'District is required',
            }),
        })
        .when('country', {
          is: 'CA',
          then: Joi.string()
            .pattern(/^[a-zA-Z ]*$/)
            .required()
            .messages({
              'string.pattern.base': 'Invalid District format',
              'any.required': 'District is required',
            }),
        }),
      postalCode: Joi.number().integer().required(),
    }),
    metadata: {
      email: Joi.string().required(),
      sessionId: Joi.string().required(),
      ipAddress: Joi.string().required(),
    },
    cvv: Joi.string().required(),
    number: Joi.string().required(),
    expMonth: Joi.string().required(),
    expYear: Joi.string().required(),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    message = validate.error;
    error = true;
  }
  return { error, message };
};

export const payoutRequest = async (data) => {
  logger.info('Insied wire payment request validator');
  const Schema = Joi.object({
    destination: Joi.object().keys({
      type: Joi.string().required().valid('wire', 'ach'),
      wireId: Joi.string().required(),
    }),
    amount: {
      amount: Joi.string().required(),
      currency: Joi.string().required(),
    },
    metadata: {
      beneficiaryEmail: Joi.string().required(),
    },
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const unlinkRequest = async (data) => {
  logger.info('Inside unlink Request validator');
  const Schema = Joi.object({
    id: Joi.string().required(),
    medium: Joi.string().required().valid('bank', 'card'),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const editCardRequest = async (data) => {
  logger.info('Inside edit Card Request validator');
  const Schema = Joi.object({
    cvv: Joi.string().required(),
    cardId: Joi.string().required(),
    expMonth: Joi.string().required(),
    expYear: Joi.string().required(),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const validatePaymentMethod = async (data) => {
  logger.info('Inside validatePaymentMethod Request validator');
  const Schema = Joi.object({
    icon: Joi.string(),
    canDeposit: Joi.bool(),
    canWithdraw: Joi.bool(),
    supportedPaymentIcon: Joi.array().items(Joi.string()),
    isHidden: Joi.bool(),
    subHeading: Joi.string(),
    description: Joi.string(),
    platform: Joi.array().items(
      Joi.object({
        name: Joi.string(),
        _id: Joi.string(),
        icon: Joi.string(),
        canDeposit: Joi.bool(),
        canWithdraw: Joi.bool(),
        isHidden: Joi.bool(),
        subHeading: Joi.string(),
        description: Joi.string(),
        depositHeading: Joi.string(),
        depositDescription: Joi.string(),
        withdrawHeading: Joi.string(),
        withdrawDescription: Joi.string(),
      })
    ),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message, sanitizedData: validate.value };
};

export const paymentIntentValidator = async (data) => {
  logger.info('Inside payment intent Request validator');
  const Schema = Joi.object({
    amount: Joi.number().required(),
    description: Joi.string().optional(),
    paymentMethodType: Joi.string().required().allow('us_bank_account', 'card', ''),
    paymentMethodId: Joi.string().required().allow(''),
    propertyId: Joi.string().required(),
    tokens: Joi.number().required(),
    credits: Joi.number().required(),
    saved: Joi.boolean(),
    international: Joi.boolean(),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const plaidTransferValidator = (data) => {
  logger.info('Inside plaid transfer Request validator');
  const Schema = Joi.object({
    amount: Joi.string().required(),
    ip_address: Joi.string().optional(),
    bank_id: Joi.string().required(),
    propertyId: Joi.string().required(),
    tokens: Joi.number().required(),
    credits: Joi.number().required(),
    promoCode: Joi.string().optional(),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const fundingSourceValidator = (data) => {
  logger.info('Inside funding source Request validator');
  const Schema = Joi.object({
    public_token: Joi.string().required(),
    account_id: Joi.string().required(),
    subtype: Joi.string().optional(),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const addRecipientsValidator = async (data) => {
  logger.info('Inside add recipients Request validator');
  const Schema = Joi.object({
    propertyId: Joi.string().required(),
    accountNumber: Joi.string().required(),
    routingNumber: Joi.string().required(),
    accountType: Joi.string().required().valid('businessChecking', 'businessSavings', 'personalChecking', 'personalSavings'),
    address: Joi.object({
      address1: Joi.string().required(),
      address2: Joi.string().optional(),
      city: Joi.string().required(),
      region: Joi.string().required(),
      postalCode: Joi.string().required(),
      country: Joi.string().required(),
    }),
    email: Joi.string().email().required(),
    name: Joi.string().required(),
    as: Joi.string().optional(),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const withdrawCreditsValidator = async (data) => {
  logger.info('Inside withdraw credits Request validator');
  const Schema = Joi.object({
    credits: Joi.number().required(),
    bank_id: Joi.string().required(),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const manualCheckoutValidator = async (data) => {
  logger.info('Inside manual checkout Request validator');
  const Schema = Joi.object({
    userId: Joi.string().required(),
    propertyId: Joi.string().required(),
    tokens: Joi.number().required(),
    paymentDetails: Joi.object({
      bankAccountId: Joi.string().optional(),
      amount: Joi.string().required(),
      credits: Joi.number().required(),
      transactionId: Joi.string().optional(),
    }),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const updatePromotionValidator = async (data) => {
  logger.info('Inside update promotion request validator');

  const promoTierSchema = Joi.object({
    investAmount: Joi.number().required(),
    numGiftTokens: Joi.number().required(),
  });

  const Schema = Joi.object({
    promoCode: Joi.string().required(),
    promoName: Joi.string().optional(),
    promoDescription: Joi.string().optional(),
    promoStateIsOn: Joi.boolean().required(),
    promoStartDate: Joi.date().optional(),
    promoEndDate: Joi.date().optional(),
    maxPromoCodeUse: Joi.number().required(),
    promoPurchaseProperties: Joi.array().items(Joi.string()).required(),
    promoGiftProperty: Joi.object({
      propertyId: Joi.string().required(),
      promoTiers: Joi.array().items(promoTierSchema).required(),
      initialTokensForPromo: Joi.number().optional(),
      tokensUsedForPromo: Joi.number().optional(),
    }).required(),
    createdAt: Joi.date().optional(),
    updateAt: Joi.date().optional(),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

export const addVendorValidator = async (data) => {
  logger.info('Inside add vendor Request validator');
  const Schema = Joi.object({
    propertyId: Joi.string().required(),
    company_name: Joi.string().required(),
    email: Joi.string().email().required(),
    accountDetails: {
      accountNumber: Joi.string().required(),
      routingNumber: Joi.string().required(),
      accountType: Joi.string().required().valid('CHECKING', 'SAVING'),
      accountClass: Joi.string().required().valid('BUSINESS', 'PERSONAL'),
    },
    as: Joi.string().optional(),
  });

  const validate = Schema.validate(data);
  let error = false;
  let message = '';

  if (validate.error) {
    message = validate.error.details[0].message;
    message = message.replace(/"/g, '');
    error = true;
  }
  return { error, message };
};

import mongoose from 'mongoose';
import db from '../../connections/dbMaster.js';

const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const paymentSchema = new Schema(
  {
    id: { type: String, sparse: true },
    amount: {
      type: {
        amount: { type: String, required: false },
        asset: String,
      },
      required: true,
    },
    quoteCurrencyAmount: Number,
    fees: {
      type: {
        amount: { type: String, required: false }, // feeAmount + extraFeeAmount + networkFeeAmount
      },
      required: false,
    },
    transactionType: {
      type: String,
      enum: ['Deposit', 'Withdrawal', 'Checkout', 'Promotion'],
      required: true,
    },
    status: {
      type: String,
      enum: ['waitingPayment', 'pending', 'waitingAuthorization', 'canceled', 'failed', 'completed', 'succeeded', 'processing', 'posted', 'returned', 'rejected'],
      required: true,
    },
    _user: { type: ObjectId, required: true, ref: 'user' },
    walletAddress: { type: String, required: false },
    walletAddressTag: String,
    fromAddress: { type: String, required: false },
    toAddress: { type: String, required: false },
    transactionHash: String, // cryptoTransactionId
    failureReason: String, // failureReason
    fraudInfo: {
      type: {
        fraudTransactionUniqueId: { type: String, required: true },
        details: {
          hasLowBalance: { type: Boolean, default: false },
          maxAllowedFraudScore: { type: Number },
          fraudDetailedInfo: { type: String },
        },
        reported: {
          type: String,
          enum: ['yes', 'no', 'failed'],
        },
      },
    },
    returnReported: {
      type: Boolean,
      default: false,
    },
    customerId: String, //customerId
    cardId: String, //cardId
    bankAccountId: String, //bankAccountId
    paymentMethod: {
      type: String,
      enum: ['credit_debit_card', 'ach_bank_transfer', 'card', 'us_bank_account', '', 'wire_transfer', 'promotion_transfer'],
    },
    balanceTx: String,
    chargeId: String,
    paymentMethodId: String,
    accountInfo: {
      type: {
        medium: { type: String },
        id: { type: String },
        description: { type: String },
      },
      required: false,
    },
    propertyId: { type: ObjectId, ref: 'property' },
    propertyName: String,
    holdTokens: Number,
    investmentStatus: {
      type: String,
      enum: ['pending', 'failed', 'completed'],
    },
    holdOrders: [
      {
        id: ObjectId,
        hold: Number,
      },
    ],
    // holdCredits: Number,
    holdCredits: {
      credits: Number,
      rentCredits: Number,
    },
    brexTransferId: String,
    brexTransferStatus: String,
    brexTransferFailureReason: String,
    brexTransferFailureAttempt: Number,
    plaidSweepStatus: { type: String, enum: ['unswept', 'swept', 'swept_settled', 'return_swept'] },
    affiliate: Boolean,
    credits: Number,
    rentCredits: Number,
    rewards: { type: Number, default: 0 },
    feeTransferId: String,
    feeTransferStatus: String,
    feeTransferFailureReason: String,
    amountSettledToLLC: Number,
    withdrawRequestedIRCredits: Number,
    withdrawRequestedIRCreditsSettled: Number,
    withdrawRequestedRentCredits: Number,
    withdrawRequestedRentCreditsSettled: Number,
    withdrawnIRCredits: {
      credits: Number,
      transferId: String,
      status: String,
      failureReason: String,
    },
    withdrawnRentCredits: [
      {
        propertyId: { type: ObjectId, ref: 'property' },
        rentBalanceId: { type: ObjectId, ref: 'rent-balance' },
        rentCredits: Number,
        transferId: String,
        status: String,
        failureReason: String,
      },
    ],
    brexVendorId: String,
    brexPaymentInstrumentId: String,
    referenceId: { type: String },
    promoId: { type: String },
  },
  {
    versionKey: false,
    timestamps: true,
    collection: 'payment',
  }
);

export default db.model('payment', paymentSchema);

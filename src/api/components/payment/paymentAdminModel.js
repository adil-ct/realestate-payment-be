import mongoose from 'mongoose';
import db from '../../connections/dbMaster.js';

const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const paymentAdminSchema = new Schema(
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
        amount: { type: String, required: false },
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
      enum: ['waitingPayment', 'pending', 'waitingAuthorization', 'failed', 'completed', 'succeeded'],
      required: true,
    },
    _user: { type: ObjectId, required: true, ref: 'admin' },
    walletAddress: { type: String, required: false },
    walletAddressTag: String,
    fromAddress: { type: String, required: false },
    toAddress: { type: String, required: false },
    transactionHash: String, // cryptoTransactionId
    failureReason: String, // failureReason
    customerId: String, //customerId
    cardId: String, //cardId
    bankAccountId: String, //bankAccountId
    paymentMethod: {
      type: String,
      enum: ['credit_debit_card', 'ach_bank_transfer', 'card', 'us_bank_account', 'promotion_transfer'],
    },
    balanceTx: String,
    chargeId: String,
    paymentMethodId: String,
    stages: [Object],
    accountInfo: {
      type: {
        medium: { type: String },
        id: { type: String },
        description: { type: String },
      },
      required: false,
    },
    referenceId: { type: String },
    promoId: { type: String },
    merchantPayment: { type: Boolean, default: false },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  {
    versionKey: false,
    // timestamps: true,
    collection: 'paymentAdmin',
  }
);

export default db.model('paymentAdmin', paymentAdminSchema);

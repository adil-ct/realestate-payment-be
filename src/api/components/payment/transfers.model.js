import mongoose from 'mongoose';
import db from '../../connections/dbMaster.js';

const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const transfersSchema = new Schema(
  {
    id: { type: String, sparse: true },
    amount: {
      type: {
        amount: { type: String, required: true },
        asset: { type: String, required: false },
      },
      required: true,
    },
    quoteCurrencyAmount: Number,
    transactionType: {
      type: String,
      enum: ['marketplace', 'crowdsale_success', 'cashflow', 'transfers', 'rent', 'referral', 'voluntary', 'promotion'],
      required: true,
    },
    transferType: {
      type: String,
      enum: ['sent', 'received'],
      required: true,
    },
    status: {
      type: String,
      enum: ['completed', 'failed', 'processing'],
      default: 'processing',
      required: true,
    },
    propertyId: { type: ObjectId, ref: 'property' },
    propertyName: { type: String, required: false },
    admin: { type: Boolean, required: true, default: false },
    merchant: { type: Boolean, required: true, default: false },
    userId: { type: ObjectId, required: true },
    transactionHash: { type: String },
    transactionId: { type: ObjectId },
    identityId: { type: ObjectId },
    _monthlyRent: { type: ObjectId },
    toAddress: String,
    fromAddress: String,
    referral: { type: Boolean },
    referee: { type: Boolean },
    referralId: { type: ObjectId, ref: 'user' },
    refereeId: { type: ObjectId, ref: 'user' },
    referralThreshold: { type: Number },
  },
  {
    versionKey: false,
    timestamps: true,
    collection: 'transfers',
  }
);

export default db.model('transfers', transfersSchema);

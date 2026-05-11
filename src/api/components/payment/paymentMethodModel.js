import mongoose from 'mongoose';
import db from '../../connections/dbMaster.js';

const { Schema } = mongoose;

const paymentMethodSchema = new Schema(
  {
    method: { type: String, enum: ['Credit / Debit Card', 'Direct USDC', 'ACH', 'Wire'] },
    icon: { type: String, default: '' },
    supportedPaymentIcon: { type: [String] },
    type: { type: String, enum: ['card', 'ach', 'wire', 'usdc', 'stripe-card', 'stripe-ach'] },
    platform: [
      {
        name: String,
        icon: { type: String },
        canDeposit: { type: Boolean, default: true },
        canWithdraw: { type: Boolean, default: true },
        isHidden: { type: Boolean, default: false },
        countries: { type: [String], default: 'all' },
        subHeading: { type: String, default: '' },
        description: { type: String, default: '' },
        depositHeading: { type: String, default: '' },
        depositDescription: { type: String, default: '' },
        withdrawHeading: { type: String, default: '' },
        withdrawDescription: { type: String, default: '' },
        updatedAt: { type: Date, default: new Date() },
      },
    ],
    canDeposit: { type: Boolean, default: true },
    canWithdraw: { type: Boolean, default: true },
    isHidden: { type: Boolean, default: false },
    subHeading: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  {
    versionKey: false,
    timestamps: true,
    collection: 'payment-methods',
  }
);

export default db.model('payment-methods', paymentMethodSchema);

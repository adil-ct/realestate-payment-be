import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import db from '../../connections/dbMaster.js';
import dateFormats from '../../helpers/date.js';

const { Schema } = mongoose;

mongoose.Promise = Promise;

const adminSchema = new Schema(
  {
    email: {
      type: String,
      require: true,
    },
    password: {
      type: String,
      required: true,
    },
    countryCode: {
      type: String,
    },
    mobileNumber: {
      type: Number,
    },
    expiresAt: {
      type: Date,
    },
    isSuperAdmin: {
      type: Boolean,
      default: false,
    },
    twoFA: {
      sms: {
        type: Boolean,
        default: false,
      },
      none: {
        type: Boolean,
        default: true,
      },
    },
    forgotPasswordRequest: {
      type: Boolean,
      default: false,
    },
    forceUpdatePassword: {
      type: Boolean,
      default: false,
    },
    tempPasswordExpiry: {
      type: Date,
      default: dateFormats.tempPasswordExpiryTime(),
    },
    bank: [
      {
        type: {
          type: String,
          enum: ['wire', 'ACH'],
        },
        bankType: {
          type: String,
          enum: ['USBANK', 'NONUS-IBAN', 'NONUS-NIBAN'],
        },
        id: String,
        trackingRef: String,
        description: String,
        accountNumber: String,
        accessToken: String,
        plaid_created_at: String,
      },
    ],
    cards: [
      {
        cardNumber: String,
        cardId: String,
      },
    ],
    walletId: String,
    blockchainAddress: String,
    status: {
      type: String,
      default: 'Active',
      enum: ['Active', 'Deactive'],
    },
    passwordResetToken: String,
  },
  {
    collection: 'admin',
    timestamps: true,
  }
);

adminSchema.pre('save', async function savePassword(next) {
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

export default db.model('admin', adminSchema);

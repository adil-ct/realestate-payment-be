import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import db from '../../connections/dbMaster.js';

const { Schema } = mongoose;

mongoose.Promise = Promise;

const userSchema = new Schema(
  {
    userType: {
      type: String,
      default: 'investor',
      enum: ['investor', 'property_manager'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: String,
    emailVerifiationExpiry: Date,
    passwordUpdatedAt: {
      type: Date,
    },
    personalDetailsCheck: {
      type: Boolean,
      default: false,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    dob: {
      type: Date,
    },
    countryCode: {
      type: String,
    },
    mobileNumber: {
      type: Number,
    },
    country: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    stateCode: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    address1: {
      type: String,
      trim: true,
    },
    address2: {
      type: String,
      trim: true,
    },
    zipCode: {
      type: Number,
    },
    mobileVerified: {
      type: Boolean,
      default: false,
    },
    profilePic: String,
    securityCheck: {
      type: Boolean,
      default: false,
    },
    twoFA: {
      authenticator: {
        type: Boolean,
        default: false,
      },
      sms: {
        type: Boolean,
        default: false,
      },
      none: {
        type: Boolean,
        default: true,
      },
    },
    kycStatus: {
      type: String,
      default: 'pending',
    },
    kycInquiryId: {
      type: String,
    },
    bank: [
      {
        access_token: String,
        account_id: String,
        mask: String,
        name: String,
        official_name: String,
        subtype: String,
        default: { type: Boolean, default: false },
        brexVendorId: String,
        brexPaymentInstrumentId: String,
      },
    ],
    walletId: String,
    blockchainAddress: String,
    authenticatorSecret: String,
    passwordResetToken: String,
    passwordResetExpires: Date,
    earlyAccess: {
      type: Boolean,
      default: false,
    },
    temporaryPassword: String,
    forceUpdatePassword: {
      type: Boolean,
      default: false,
    },
    achWithdrawBlockedFunds: [
      {
        amount: Number,
        withdrawAllowedDate: Date,
      },
    ],
    venly: {
      walletId: String,
      pincode: String,
    },
    firstDeposit: Number,
    depositBalance: Number,
    credits: { type: Number, default: 0 },
    creditsOnHold: { type: Number, default: 0 },
    rentCredits: { type: Number, default: 0 },
    rentCreditsOnHold: { type: Number, default: 0 },
    personaAccId: String,
    privateKey: String,
    stripe: {
      customerId: String,
    },
  },
  {
    collection: 'user',
    timestamps: true,
  }
);

export default db.model('user', userSchema);

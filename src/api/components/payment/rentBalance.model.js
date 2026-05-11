import mongoose from 'mongoose';
import db from '../../connections/dbMaster.js';

const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const rentBalanceSchema = new Schema(
  {
    _property: { type: ObjectId, ref: 'property' },
    _user: { type: ObjectId, ref: 'user' },
    rentCredits: Number,
    rentCreditsOnHold: Number,
  },
  {
    versionKey: false,
    timestamps: true,
    collection: 'rent-balance',
  }
);

export default db.model('rent-balance', rentBalanceSchema);

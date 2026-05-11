import mongoose from 'mongoose';
import db from '../../connections/dbMaster.js';

const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const orderSchema = new Schema(
  {
    sellerId: { type: ObjectId, required: true, ref: 'user' },
    sellerAddress: { type: String, required: true },
    _property: { type: ObjectId, required: true, ref: 'property' },
    listingId: { type: String, required: true },
    tokenId: { type: String, required: true },
    tokens: { type: Number, required: true },
    soldTokens: { type: Number, required: true, default: 0 },
    tokensOnHold: { type: Number, default: 0 },
    status: {
      type: String,
      required: true,
      default: 'pending',
      enum: ['pending', 'partial', 'completed', 'canceled'],
    },
  },
  {
    timestamps: true,
    collection: 'property-orders',
  }
);

export default db.model('property-orders', orderSchema);

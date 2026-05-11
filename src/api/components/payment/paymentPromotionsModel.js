import mongoose from 'mongoose';
import db from '../../connections/dbMaster.js';

const Schema = mongoose.Schema;

const paymentPromotionsSchema = new Schema(
  {
    promoCode: { type: String, required: true },
    promoName: { type: String, required: false },
    promoDescription: { type: String, required: false },
    promoStateIsOn: { type: Boolean, default: false },
    promoStartDate: { type: Date, required: true },
    promoEndDate: { type: Date, required: true },
    maxPromoCodeUse: { type: Number, required: true },
    promoPurchaseProperties: { type: [String] },
    promoGiftProperty: {
      propertyId: {  type: String, required: true },
      promoTiers: [{
        investAmount: { type: Number, required: true },
        numGiftTokens: { type: Number, required: true }
      }],
      initialTokensForPromo: { type: Number, required: true },
      tokensUsedForPromo: { type: Number, required: true } 
    },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  }
);

export default db.model('promotions', paymentPromotionsSchema);

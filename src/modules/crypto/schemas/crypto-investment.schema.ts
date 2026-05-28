import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
 
export type CryptoInvestmentDocument = CryptoInvestment & Document;
 
@Schema({ timestamps: true, collection: 'crypto_investments' })
export class CryptoInvestment {
  @Prop({ type: Types.ObjectId, ref: 'User',    required: true, index: true }) userId:    Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true }) accountId: Types.ObjectId;
 
  @Prop({ required: true }) symbol:      string;   // 'BTC' | 'ETH' | 'SOL' etc.
  @Prop({ required: true }) coinName:    string;   // 'Bitcoin' | 'Ethereum' etc.
 
  @Prop({ required: true }) amountUSD:   number;   // USD invested
  @Prop({ required: true }) cryptoAmount:number;   // coins bought
  @Prop({ required: true }) buyPrice:    number;   // price per coin at buy time (USD)
 
  @Prop({ default: 0 }) currentPrice:   number;   // updated on portfolio fetch
  @Prop({ default: 0 }) currentValue:   number;   // cryptoAmount * currentPrice
  @Prop({ default: 0 }) profitLoss:     number;
  @Prop({ default: 0 }) profitLossPercent: number;
 
  @Prop({ type: String, enum: ['buy', 'sell'], default: 'buy' }) action: string;
  @Prop({ type: String, enum: ['pending', 'filled', 'cancelled'], default: 'filled' }) orderStatus: string;
 
  @Prop({ required: true }) referenceNumber: string;
 
  // Sell record fields (populated when action === 'sell')
  @Prop() sellPrice:     number;
  @Prop() sellAmountUSD: number;
  @Prop() soldAt:        Date;
}
 
export const CryptoInvestmentSchema = SchemaFactory.createForClass(CryptoInvestment);
CryptoInvestmentSchema.index({ userId: 1, action: 1, createdAt: -1 });
 
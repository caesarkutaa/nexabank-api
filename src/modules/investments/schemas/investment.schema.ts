import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InvestmentDocument = Investment & Document;

export enum OrderAction { BUY = 'buy', SELL = 'sell' }
export enum OrderStatus { PENDING = 'pending', FILLED = 'filled', CANCELLED = 'cancelled', FAILED = 'failed' }

@Schema({ timestamps: true, collection: 'investments' })
export class Investment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true }) accountId: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true }) symbol: string;
  @Prop({ required: true }) companyName: string;
  @Prop({ required: true, min: 0 }) shares: number;
  @Prop({ required: true, min: 0 }) buyPrice: number;
  @Prop({ default: 0 }) currentPrice: number;
  @Prop({ required: true }) totalInvested: number;
  @Prop({ default: 0 }) currentValue: number;
  @Prop({ default: 0 }) profitLoss: number;
  @Prop({ default: 0 }) profitLossPercent: number;

  @Prop({ type: String, enum: OrderAction, required: true }) action: OrderAction;
  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.PENDING }) orderStatus: OrderStatus;

  @Prop() alpacaOrderId: string;
  @Prop() filledAt: Date;
  @Prop() referenceNumber: string;
}

export const InvestmentSchema = SchemaFactory.createForClass(Investment);
InvestmentSchema.index({ userId: 1, symbol: 1 });
InvestmentSchema.index({ userId: 1, createdAt: -1 });
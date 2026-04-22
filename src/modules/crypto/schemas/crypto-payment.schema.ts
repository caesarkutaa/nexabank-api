import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CryptoPaymentDocument = CryptoPayment & Document;

export enum CryptoCurrency { BTC = 'BTC', ETH = 'ETH', USDC = 'USDC', LTC = 'LTC', BCH = 'BCH' }
export enum CryptoStatus {
  NEW = 'NEW', PENDING = 'PENDING', COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED', FAILED = 'FAILED', CANCELLED = 'CANCELLED',
}

@Schema({ timestamps: true, collection: 'crypto_payments' })
export class CryptoPayment {
  @Prop({ type: Types.ObjectId, ref: 'User',    required: true, index: true }) userId:    Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true }) accountId: Types.ObjectId;

  @Prop({ type: String, enum: CryptoCurrency, required: true }) cryptocurrency: CryptoCurrency;
  @Prop({ required: true }) amountUSD:    number;
  @Prop({ required: true }) cryptoAmount: number;
  @Prop({ required: true }) exchangeRate: number;
  @Prop() recipientAddress:   string;
  @Prop() recipientName:      string;
  @Prop() coinbaseChargeId:   string;
  @Prop() coinbaseChargeCode: string;
  @Prop() hostedUrl:          string;
  @Prop({ type: String, enum: CryptoStatus, default: CryptoStatus.NEW }) status: CryptoStatus;
  @Prop() txHash:             string;
  @Prop() completedAt:        Date;
  @Prop({ required: true }) referenceNumber: string;
  @Prop() description: string;
}

export const CryptoPaymentSchema = SchemaFactory.createForClass(CryptoPayment);
CryptoPaymentSchema.index({ userId: 1, createdAt: -1 });
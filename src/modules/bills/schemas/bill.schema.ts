import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BillDocument = Bill & Document;

export enum BillCategory {
  ELECTRICITY  = 'electricity',
  WATER        = 'water',
  INTERNET     = 'internet',
  PHONE        = 'phone',
  GAS          = 'gas',
  INSURANCE    = 'insurance',
  SUBSCRIPTION = 'subscription',
  RENT         = 'rent',
  CABLE        = 'cable',
  OTHER        = 'other',
}

export enum BillStatus {
  PENDING    = 'pending',
  PROCESSING = 'processing',
  PAID       = 'paid',
  FAILED     = 'failed',
}

@Schema({ timestamps: true, collection: 'bills' })
export class Bill {
  @Prop({ type: Types.ObjectId, ref: 'User',    required: true, index: true }) userId:    Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true }) accountId: Types.ObjectId;

  @Prop({ required: true }) billerName:   string;
  @Prop({ required: true }) billerCode:   string;
  @Prop({ required: true }) accountRef:   string;
  @Prop({ required: true, min: 0 }) amount: number;
  @Prop({ type: String, enum: BillCategory, default: BillCategory.OTHER }) category: BillCategory;
  @Prop({ type: String, enum: BillStatus, default: BillStatus.PENDING }) status: BillStatus;

  @Prop() referenceNumber: string;
  @Prop() paidAt:          Date;
  @Prop() receiptUrl:      string;
  @Prop() description:     string;
  @Prop({ default: false }) isRecurring: boolean;
  @Prop({ min: 1, max: 31 }) recurringDay: number;
  @Prop() failureReason: string;
}

export const BillSchema = SchemaFactory.createForClass(Bill);
BillSchema.index({ userId: 1, createdAt: -1 });
BillSchema.index({ userId: 1, status: 1 });
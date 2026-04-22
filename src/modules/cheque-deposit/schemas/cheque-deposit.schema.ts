import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChequeDepositDocument = ChequeDeposit & Document;

export enum ChequeStatus {
  SUBMITTED  = 'submitted',
  REVIEWING  = 'reviewing',
  APPROVED   = 'approved',
  REJECTED   = 'rejected',
  CLEARED    = 'cleared',
}

@Schema({ timestamps: true, collection: 'cheque_deposits' })
export class ChequeDeposit {
  @Prop({ type: Types.ObjectId, ref: 'User',    required: true, index: true }) userId:    Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true }) accountId: Types.ObjectId;

  @Prop({ required: true }) chequeNumber:   string;
  @Prop({ required: true }) payerName:      string;
  @Prop({ required: true }) payerBank:      string;
  @Prop({ required: true, min: 0 }) amount: number;
  @Prop({ required: true }) memo:           string;

  // ── Images (Cloudinary) ───────────────────────────────────────
  @Prop({ required: true }) frontImageUrl:      string;
  @Prop({ required: true }) frontImagePublicId: string;
  @Prop() backImageUrl:      string;
  @Prop() backImagePublicId: string;

  @Prop({ type: String, enum: ChequeStatus, default: ChequeStatus.SUBMITTED }) status: ChequeStatus;
  @Prop() referenceNumber:  string;
  @Prop() rejectionReason:  string;
  @Prop() clearedAt:        Date;
  @Prop() reviewedAt:       Date;

  // Funds availability
  @Prop({ default: 1 }) availabilityDays: number; // days until funds available
  @Prop() fundsAvailableAt: Date;
}

export const ChequeDepositSchema = SchemaFactory.createForClass(ChequeDeposit);
ChequeDepositSchema.index({ userId: 1, createdAt: -1 });
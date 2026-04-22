import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionDocument = Transaction & Document;

export enum TransactionType {
  DEPOSIT                 = 'deposit',
  WITHDRAWAL              = 'withdrawal',
  INTRABANK_TRANSFER      = 'intrabank_transfer',
  INTERBANK_TRANSFER      = 'interbank_transfer',
  INTERNATIONAL_TRANSFER  = 'international_transfer',
  BILL_PAYMENT            = 'bill_payment',
  CHEQUE_DEPOSIT          = 'cheque_deposit',
  CRYPTO_PAYMENT          = 'crypto_payment',
  INVESTMENT              = 'investment',
  LOAN_DISBURSEMENT       = 'loan_disbursement',
  LOAN_REPAYMENT          = 'loan_repayment',
  CARD_PAYMENT            = 'card_payment',
  FEE                     = 'fee',
  INTEREST                = 'interest',
}

export enum TransactionStatus {
  PENDING    = 'pending',
  PROCESSING = 'processing',
  COMPLETED  = 'completed',
  FAILED     = 'failed',
  REVERSED   = 'reversed',
  CANCELLED  = 'cancelled',
}

export enum TransactionDirection { CREDIT = 'credit', DEBIT = 'debit' }

@Schema({ timestamps: true, collection: 'transactions' })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'User',    required: true, index: true }) userId:    Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true, index: true }) accountId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true }) referenceNumber: string;

  @Prop({ type: String, enum: TransactionType      }) type:      TransactionType;
  @Prop({ type: String, enum: TransactionStatus, default: TransactionStatus.PENDING }) status: TransactionStatus;
  @Prop({ type: String, enum: TransactionDirection }) direction: TransactionDirection;

  @Prop({ required: true, min: 0 }) amount:   number;
  @Prop({ default: 0              }) fee:      number;
  @Prop({ default: 'USD'          }) currency: string;
  @Prop() exchangeRate: number;
  @Prop() description: string;

  // ── Sender ────────────────────────────────────────────────────
  @Prop() senderAccountNumber: string;
  @Prop() senderBankName:      string;
  @Prop() senderRoutingNumber: string;
  @Prop() senderName:          string;

  // ── Recipient ─────────────────────────────────────────────────
  @Prop() recipientAccountNumber: string;
  @Prop() recipientBankName:      string;
  @Prop() recipientRoutingNumber: string;
  @Prop() recipientName:          string;
  @Prop() recipientCountry:       string;
  @Prop() swiftCode:              string;
  @Prop() ibanNumber:             string;

  // ── Receipt ───────────────────────────────────────────────────
  @Prop() receiptUrl: string;

  // ── Metadata ──────────────────────────────────────────────────
  @Prop({ type: Object }) metadata: Record<string, any>;
  @Prop() processedAt: Date;
  @Prop() balanceAfter: number;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ accountId: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, status: 1 });
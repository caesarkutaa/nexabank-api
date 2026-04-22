import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AccountDocument = Account & Document;

export enum AccountType   { CHECKING = 'checking', SAVINGS = 'savings', MONEY_MARKET = 'money_market' }
export enum AccountStatus { ACTIVE = 'active', FROZEN = 'frozen', CLOSED = 'closed', DORMANT = 'dormant' }

@Schema({ timestamps: true, collection: 'accounts' })
export class Account {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) userId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true }) accountNumber: string;
  @Prop({ required: true }) routingNumber: string;

  @Prop({ type: String, enum: AccountType,   default: AccountType.CHECKING   }) accountType: AccountType;
  @Prop({ type: String, enum: AccountStatus, default: AccountStatus.ACTIVE   }) status:      AccountStatus;

  @Prop({ default: 0, min: 0 }) balance:          number;
  @Prop({ default: 0, min: 0 }) availableBalance: number;
  @Prop({ default: 0         }) pendingBalance:   number;

  @Prop({ default: 'USD' }) currency: string;
  @Prop({ default: 0     }) interestRate: number;

  // ── Analytics ─────────────────────────────────────────────────
  @Prop({ default: 0 }) totalDeposited:  number;
  @Prop({ default: 0 }) totalWithdrawn:  number;
  @Prop({ default: 0 }) monthlyIncome:   number;
  @Prop({ default: 0 }) monthlyExpenses: number;

  @Prop({ default: false }) isPrimary:  boolean;
  @Prop() nickname: string;
}

export const AccountSchema = SchemaFactory.createForClass(Account);
       
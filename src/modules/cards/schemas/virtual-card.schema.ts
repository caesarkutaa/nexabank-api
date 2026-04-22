import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VirtualCardDocument = VirtualCard & Document;

export enum CardNetwork { VISA = 'visa', MASTERCARD = 'mastercard' }
export enum CardStatus  { ACTIVE = 'active', FROZEN = 'frozen', CANCELLED = 'cancelled', EXPIRED = 'expired' }

@Schema({ timestamps: true, collection: 'virtual_cards' })
export class VirtualCard {
  @Prop({ type: Types.ObjectId, ref: 'User',    required: true, index: true }) userId:    Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true }) accountId: Types.ObjectId;

  @Prop({ required: true, select: false }) cardNumber:     string; // AES-256 encrypted
  @Prop({ required: true }) last4:          string;
  @Prop({ required: true }) expiryMonth:    number;
  @Prop({ required: true }) expiryYear:     number;
  @Prop({ required: true, select: false }) cvv: string;           // AES-256 encrypted
  @Prop({ required: true }) cardHolderName: string;

  @Prop({ type: String, enum: CardNetwork, default: CardNetwork.VISA })
  network: CardNetwork;

  @Prop({ type: String, enum: CardStatus, default: CardStatus.ACTIVE })
  status: CardStatus;

  // ── Limits ────────────────────────────────────────────────────
  @Prop({ default: 5000  }) dailyLimit:      number;
  @Prop({ default: 20000 }) monthlyLimit:    number;
  @Prop({ default: 0     }) spentToday:      number;
  @Prop({ default: 0     }) spentThisMonth:  number;

  // ── Controls ──────────────────────────────────────────────────
  @Prop({ default: true  }) onlinePayments:        boolean;
  @Prop({ default: false }) internationalPayments:  boolean;
  @Prop({ default: true  }) contactlessPayments:    boolean;

  @Prop() nickname:       string;
  @Prop() cancelledAt:    Date;
  @Prop() lastUsedAt:     Date;
}

export const VirtualCardSchema = SchemaFactory.createForClass(VirtualCard);
VirtualCardSchema.index({ userId: 1, status: 1 });
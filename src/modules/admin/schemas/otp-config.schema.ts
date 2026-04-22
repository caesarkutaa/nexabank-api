import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OtpConfigDocument = OtpConfig & Document;

@Schema({ timestamps: true, collection: 'otp_config' })
export class OtpConfig {
  @Prop({ required: true, unique: true }) purpose: string;
  @Prop({ default: true }) isEnabled: boolean;
  @Prop({ default: 10 }) expiryMinutes: number;
  @Prop({ default: 3 }) maxAttempts: number;
  @Prop() pausedReason: string;
  @Prop() pausedAt: Date;
  @Prop() pausedBy: string;
}

export const OtpConfigSchema = SchemaFactory.createForClass(OtpConfig);
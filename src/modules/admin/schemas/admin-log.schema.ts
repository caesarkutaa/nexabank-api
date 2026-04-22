import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdminLogDocument = AdminLog & Document;

@Schema({ timestamps: true, collection: 'admin_logs' })
export class AdminLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) adminId: Types.ObjectId;
  @Prop({ required: true }) adminUsername: string;
  @Prop({ required: true }) action: string;
  @Prop({ required: true }) targetType: string; // user, account, transfer, loan, kyc, etc
  @Prop({ type: Types.ObjectId }) targetId: Types.ObjectId;
  @Prop({ type: Object }) before: Record<string, any>;
  @Prop({ type: Object }) after: Record<string, any>;
  @Prop() ipAddress: string;
  @Prop() notes: string;
}

export const AdminLogSchema = SchemaFactory.createForClass(AdminLog);
AdminLogSchema.index({ adminId: 1, createdAt: -1 });
AdminLogSchema.index({ targetType: 1, targetId: 1 });
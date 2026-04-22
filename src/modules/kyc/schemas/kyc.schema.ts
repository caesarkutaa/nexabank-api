import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type KycDocument = Kyc & Document;

@Schema({ timestamps: true, collection: 'kyc_verifications' })
export class Kyc {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true }) userId: Types.ObjectId;

  @Prop({ type: String, enum: ['not_started','pending','approved','rejected','resubmit'], default: 'not_started' })
  status: string;

  @Prop({ type: String, enum: ['passport','drivers_license','national_id','state_id'], required: true })
  documentType: string;

  @Prop() documentNumber:         string;
  @Prop() documentFrontUrl:       string;
  @Prop() documentFrontPublicId:  string;
  @Prop() documentBackUrl:        string;
  @Prop() documentBackPublicId:   string;
  @Prop() selfieUrl:              string;
  @Prop() selfiePublicId:         string;

  @Prop() reviewedAt:    Date;
  @Prop() reviewedBy:    string;
  @Prop() rejectionNote: string;
  @Prop() expiryDate:    Date;

  @Prop({ default: false }) addressVerified:   boolean;
  @Prop({ default: false }) identityVerified:  boolean;
  @Prop({ default: false }) documentVerified:  boolean;
}

export const KycSchema = SchemaFactory.createForClass(Kyc);
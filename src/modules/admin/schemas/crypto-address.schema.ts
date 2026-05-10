import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
 
export type CryptoAddressDocument = CryptoAddress & Document;
 
@Schema({ timestamps: true, collection: 'cryptoaddresses' })
export class CryptoAddress {
  @Prop({ required: true, unique: true, index: true })
  network: string;              
 
  @Prop({ required: true })
  coin: string;                
 
  @Prop({ required: true })
  address: string;              // The actual wallet address
 
  @Prop()
  label?: string;               
 
  @Prop()
  memo?: string;               
  @Prop()
  qrCodeUrl?: string;           
 
  @Prop({ default: true })
  isActive: boolean;            
 
  @Prop({ default: 0 })
  minimumDeposit: number;       
  @Prop({ default: 1 })
  confirmationsRequired: number; 
 
  // Audit
  @Prop()
  lastUpdatedBy?: string;       
}

export const CryptoAddressSchema = SchemaFactory.createForClass(CryptoAddress)

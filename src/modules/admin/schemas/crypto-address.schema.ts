import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CryptoAddressDocument = CryptoAddress & Document;

export enum CryptoNetwork {
  BITCOIN = 'BTC',
  ETHEREUM = 'ETH',
  USDT_TRC20 = 'USDT_TRC20',
  USDT_ERC20 = 'USDT_ERC20',
  TRON = 'TRX',
  LITECOIN = 'LTC',
  BCH = 'BCH',
}

@Schema({ timestamps: true, collection: 'crypto_addresses' })
export class CryptoAddress {
  @Prop({ type: String, enum: CryptoNetwork, required: true, unique: true }) network: CryptoNetwork;
  @Prop({ required: true }) address: string;
  @Prop({ required: true }) label: string;
  @Prop() qrCodeUrl: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop() memo: string; // for some networks like XRP, STELLAR
  @Prop() minimumDeposit: number;
  @Prop() confirmationsRequired: number;
}

export const CryptoAddressSchema = SchemaFactory.createForClass(CryptoAddress);
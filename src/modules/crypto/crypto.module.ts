import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CryptoController } from './crypto.controller';
import { CryptoAddress, CryptoAddressSchema } from '../admin/schemas/crypto-address.schema';
 
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CryptoAddress.name, schema: CryptoAddressSchema },
    ]),
  ],
  controllers: [CryptoController],
})
export class CryptoModule {}
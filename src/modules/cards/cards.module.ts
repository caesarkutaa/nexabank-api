import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { VirtualCard, VirtualCardSchema } from './schemas/virtual-card.schema';
import { Account, AccountSchema } from '../accounts/schemas/account.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VirtualCard.name, schema: VirtualCardSchema },
      { name: Account.name,     schema: AccountSchema     },
    ]),
  ],
  controllers: [CardsController],
  providers:   [CardsService],
  exports:     [CardsService],
})
export class CardsModule {}
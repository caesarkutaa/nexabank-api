import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { Account, AccountSchema } from './schemas/account.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Account.name,     schema: AccountSchema     },
      { name: Transaction.name, schema: TransactionSchema }, // needed for dashboard aggregation
    ]),
  ],
  controllers: [AccountsController],
  providers:   [AccountsService],
  exports:     [AccountsService],             // exported so TransfersService can use it
})
export class AccountsModule {}
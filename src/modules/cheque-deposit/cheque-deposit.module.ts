import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChequeDepositController } from './cheque-deposit.controller';
import { ChequeDepositService } from './cheque-deposit.service';
import { ChequeDeposit, ChequeDepositSchema } from './schemas/cheque-deposit.schema';
import { Account, AccountSchema } from '../accounts/schemas/account.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChequeDeposit.name, schema: ChequeDepositSchema },
      { name: Account.name,       schema: AccountSchema       },
      { name: Transaction.name,   schema: TransactionSchema   },
    ]),
    NotificationsModule,
  ],
  controllers: [ChequeDepositController],
  providers:   [ChequeDepositService],
  exports:     [ChequeDepositService],
})
export class ChequeDepositModule {}

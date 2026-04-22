import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvestmentsController } from './investments.controller';
import { InvestmentsService } from './investments.service';
import { Investment, InvestmentSchema } from './schemas/investment.schema';
import { Account, AccountSchema } from '../accounts/schemas/account.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Investment.name,  schema: InvestmentSchema  },
      { name: Account.name,     schema: AccountSchema     },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [InvestmentsController],
  providers:   [InvestmentsService],
  exports:     [InvestmentsService],
})
export class InvestmentsModule {}

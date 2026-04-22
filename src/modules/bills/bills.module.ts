import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';
import { Bill, BillSchema } from './schemas/bill.schema';
import { Account, AccountSchema } from '../accounts/schemas/account.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { OtpModule } from '../otp/otp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReceiptsModule } from '../receipts/receipts.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Bill.name,        schema: BillSchema        },
      { name: Account.name,     schema: AccountSchema     },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    OtpModule,
    NotificationsModule,
    ReceiptsModule,
  ],
  controllers: [BillsController],
  providers:   [BillsService],
  exports:     [BillsService],
})
export class BillsModule {}
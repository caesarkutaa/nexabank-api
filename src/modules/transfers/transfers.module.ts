import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { Account, AccountSchema } from '../accounts/schemas/account.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { OtpModule } from '../otp/otp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReceiptsModule } from '../receipts/receipts.module';  

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Account.name,     schema: AccountSchema     },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    OtpModule,
    NotificationsModule,
    ReceiptsModule,  
  ],
  controllers: [TransfersController],
  providers:   [TransfersService],
  exports:     [TransfersService],
})
export class TransfersModule {}
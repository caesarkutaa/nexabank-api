import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';
import { Loan, LoanSchema } from './schemas/loan.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Account, AccountSchema } from '../accounts/schemas/account.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { OtpModule } from '../otp/otp.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Loan.name,        schema: LoanSchema        },
      { name: User.name,        schema: UserSchema        },
      { name: Account.name,     schema: AccountSchema     },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    NotificationsModule,
    OtpModule,
  ],
  controllers: [LoansController],
  providers:   [LoansService],
  exports:     [LoansService],
})
export class LoansModule {}
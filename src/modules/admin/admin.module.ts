import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

import { AdminLog, AdminLogSchema } from './schemas/admin-log.schema';
import { CryptoAddress, CryptoAddressSchema } from './schemas/crypto-address.schema';
import { OtpConfig, OtpConfigSchema } from './schemas/otp-config.schema';

import { User, UserSchema } from '../users/schemas/user.schema';
import { Account, AccountSchema } from '../accounts/schemas/account.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { Loan, LoanSchema } from '../loans/schemas/loan.schema';
import { Kyc, KycSchema } from '../kyc/schemas/kyc.schema';
import { ChequeDeposit, ChequeDepositSchema } from '../cheque-deposit/schemas/cheque-deposit.schema';
import { Investment, InvestmentSchema } from '../investments/schemas/investment.schema';

import { NotificationsModule } from '../notifications/notifications.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { CryptoInvestment, CryptoInvestmentSchema } from '../crypto/schemas/crypto-investment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminLog.name,      schema: AdminLogSchema      },
      { name: CryptoAddress.name, schema: CryptoAddressSchema },
      { name: OtpConfig.name,     schema: OtpConfigSchema     },
      { name: User.name,          schema: UserSchema          },
      { name: Account.name,       schema: AccountSchema       },
      { name: Transaction.name,   schema: TransactionSchema   },
      { name: Loan.name,          schema: LoanSchema          },
      { name: Kyc.name,           schema: KycSchema           },
      { name: ChequeDeposit.name, schema: ChequeDepositSchema },
      { name: Investment.name,    schema: InvestmentSchema    },
      { name: CryptoInvestment.name, schema: CryptoInvestmentSchema },
    ]),
    NotificationsModule,
    ReceiptsModule,
  ],
  controllers: [AdminController],
  providers:   [AdminService],
  exports:     [AdminService],
})
export class AdminModule {}
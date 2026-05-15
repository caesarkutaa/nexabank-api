import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CryptoController } from './crypto.controller';
import { CryptoService }    from './crypto.service';
import { CryptoPayment,    CryptoPaymentSchema    } from './schemas/crypto-payment.schema';
import { CryptoInvestment, CryptoInvestmentSchema } from './schemas/crypto-investment.schema';
import { CryptoAddress,    CryptoAddressSchema    } from '../admin/schemas/crypto-address.schema';
import { Account,          AccountSchema          } from '../accounts/schemas/account.schema';
import { Transaction,      TransactionSchema      } from '../transactions/schemas/transaction.schema';
import { OtpModule }           from '../otp/otp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReceiptsModule }      from '../receipts/receipts.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CryptoPayment.name,    schema: CryptoPaymentSchema    },
      { name: CryptoInvestment.name, schema: CryptoInvestmentSchema },
      { name: CryptoAddress.name,    schema: CryptoAddressSchema    },
      { name: Account.name,          schema: AccountSchema          },
      { name: Transaction.name,      schema: TransactionSchema      },
    ]),
    OtpModule,
    NotificationsModule,
    ReceiptsModule,
  ],
  controllers: [CryptoController],
  providers:   [CryptoService],
  exports:     [CryptoService],
})
export class CryptoModule {}
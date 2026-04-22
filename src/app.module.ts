import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { CardsModule } from './modules/cards/cards.module';
import { LoansModule } from './modules/loans/loans.module';
import { InvestmentsModule } from './modules/investments/investments.module';
import { BillsModule } from './modules/bills/bills.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { KycModule } from './modules/kyc/kyc.module';
import { OtpModule } from './modules/otp/otp.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { ChequeDepositModule } from './modules/cheque-deposit/cheque-deposit.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
        dbName: 'nexabank',
      }),
      inject: [ConfigService],
    }),

    ThrottlerModule.forRoot([    
      { name: 'short',  ttl: 1000,  limit: 10  },
      { name: 'medium', ttl: 10000, limit: 50  },
      { name: 'long',   ttl: 60000, limit: 200 },
    ]),

    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),

    AuthModule,
    UsersModule,
    AccountsModule,
    TransactionsModule,
    TransfersModule,
    CardsModule,
    LoansModule,
    InvestmentsModule,
    BillsModule,
    CryptoModule,
    KycModule,
    OtpModule,
    NotificationsModule,
    ReceiptsModule,
    ChequeDepositModule,
    AdminModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
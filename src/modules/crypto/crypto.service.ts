import {
  Injectable, BadRequestException, NotFoundException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  CryptoPayment, CryptoPaymentDocument, CryptoStatus,
} from './schemas/crypto-payment.schema';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import { Transaction, TransactionDocument, TransactionType, TransactionStatus, TransactionDirection } from '../transactions/schemas/transaction.schema';
import { OtpService } from '../otp/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { generateReference } from '../../common/utils/generate-ref.util';
import { InitiateCryptoDto } from './dto/crypto-payment.dto';

// Live exchange rates from CoinGecko (free, no API key needed)
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', USDC: 'usd-coin', LTC: 'litecoin', BCH: 'bitcoin-cash',
};

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly coinbaseKey: string;

  constructor(
    @InjectModel(CryptoPayment.name) private cryptoModel:   Model<CryptoPaymentDocument>,
    @InjectModel(Account.name)       private accountModel:  Model<AccountDocument>,
    @InjectModel(Transaction.name)   private txModel:       Model<TransactionDocument>,
    private readonly config:               ConfigService,
    private readonly otpService:           OtpService,
    private readonly notificationsService: NotificationsService,
    private readonly receiptsService:      ReceiptsService,
  ) {
    this.coinbaseKey = config.get<string>('COINBASE_COMMERCE_API_KEY', '');
  }

  // ── Get Exchange Rates ────────────────────────────────────────
  async getExchangeRates() {
    try {
      const ids     = Object.values(COINGECKO_IDS).join(',');
      const { data } = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      );
      const rates: Record<string, number> = {};
      for (const [sym, id] of Object.entries(COINGECKO_IDS)) {
        rates[sym] = (data as any)[id]?.usd ?? 0;
      }
      return rates;
    } catch {
      // Fallback approximate rates
      return { BTC: 67000, ETH: 3500, USDC: 1, LTC: 85, BCH: 480 };
    }
  }

  // ── Initiate — sends OTP ──────────────────────────────────────
  async initiate(userId: string, dto: Omit<InitiateCryptoDto, 'otp'>, userEmail: string) {
    const account = await this.accountModel.findOne({
      _id: new Types.ObjectId(dto.accountId), userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');

    const rates        = await this.getExchangeRates();
    const rate         = rates[dto.cryptocurrency];
    if (!rate) throw new BadRequestException(`Unsupported cryptocurrency: ${dto.cryptocurrency}`);

    const cryptoAmount = +(dto.amountUSD / rate).toFixed(8);
    const fee          = +(dto.amountUSD * 0.015).toFixed(2); // 1.5% crypto fee
    const totalUSD     = +(dto.amountUSD + fee).toFixed(2);

    if (account.availableBalance < totalUSD)
      throw new BadRequestException(`Insufficient funds. Required: $${totalUSD}`);

    const otp = this.otpService.generate();
    this.otpService.save(this.otpService.buildKey(userId, 'crypto_payment'), otp);
    await this.notificationsService.sendOtpEmail(userEmail, otp, 'transfer_confirmation');

    return {
      message:       'OTP sent. Confirm to complete crypto payment.',
      preview:       { amountUSD: dto.amountUSD, cryptocurrency: dto.cryptocurrency, cryptoAmount, exchangeRate: rate, fee, totalUSD },
      requiresOtp:   true,
    };
  }

  // ── Confirm Payment ───────────────────────────────────────────
  async confirm(userId: string, dto: InitiateCryptoDto, user: any) {
    this.otpService.verify(this.otpService.buildKey(userId, 'crypto_payment'), dto.otp);

    const account = await this.accountModel.findOne({
      _id: new Types.ObjectId(dto.accountId), userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');

    const rates        = await this.getExchangeRates();
    const rate         = rates[dto.cryptocurrency];
    const cryptoAmount = +(dto.amountUSD / rate).toFixed(8);
    const fee          = +(dto.amountUSD * 0.015).toFixed(2);
    const totalUSD     = +(dto.amountUSD + fee).toFixed(2);

    if (account.availableBalance < totalUSD) throw new BadRequestException('Insufficient funds');

    const ref = generateReference('CRYPTO');

    // Create Coinbase Commerce charge
    let chargeId   = '';
    let chargeCode = '';
    let hostedUrl  = '';
    try {
      const { data } = await axios.post(
        'https://api.commerce.coinbase.com/charges',
        {
          name:         'NexaBank Crypto Payment',
          description:  dto.description ?? `${dto.cryptocurrency} Payment`,
          pricing_type: 'fixed_price',
          local_price:  { amount: String(dto.amountUSD), currency: 'USD' },
          metadata:     { userId, referenceNumber: ref },
        },
        {
          headers: {
            'X-CC-Api-Key':  this.coinbaseKey,
            'X-CC-Version':  '2018-03-22',
            'Content-Type':  'application/json',
          },
        },
      );
      chargeId   = (data as any).data?.id ?? '';
      chargeCode = (data as any).data?.code ?? '';
      hostedUrl  = (data as any).data?.hosted_url ?? '';
    } catch (err) {
      this.logger.warn('Coinbase Commerce charge creation failed', err);
    }

    // Debit account
    account.balance          -= totalUSD;
    account.availableBalance -= totalUSD;
    account.totalWithdrawn   += totalUSD;
    await account.save();

    // Record crypto payment
    const payment = await this.cryptoModel.create({
      userId:           new Types.ObjectId(userId),
      accountId:        account._id,
      cryptocurrency:   dto.cryptocurrency,
      amountUSD:        dto.amountUSD,
      cryptoAmount,
      exchangeRate:     rate,
      recipientAddress: dto.recipientAddress,
      recipientName:    dto.recipientName,
      coinbaseChargeId: chargeId,
      coinbaseChargeCode: chargeCode,
      hostedUrl,
      status:           CryptoStatus.PENDING,
      referenceNumber:  ref,
      description:      dto.description,
    });

    // Record transaction
    const tx = await this.txModel.create({
      userId:      new Types.ObjectId(userId),
      accountId:   account._id,
      referenceNumber: ref,
      type:        TransactionType.CRYPTO_PAYMENT,
      status:      TransactionStatus.PROCESSING,
      direction:   TransactionDirection.DEBIT,
      amount:      dto.amountUSD,
      fee,
      currency:    'USD',
      description: `Crypto Payment — ${cryptoAmount} ${dto.cryptocurrency}`,
      balanceAfter: account.balance,
      processedAt: new Date(),
      metadata:    { cryptocurrency: dto.cryptocurrency, cryptoAmount, exchangeRate: rate, chargeId },
    });

    // Receipt
    const receiptUrl = await this.receiptsService.generatePdfReceipt(tx);

    await this.notificationsService.sendTransferAlert(user.email, {
      direction: 'debit', amount: dto.amountUSD, fee, ref, type: 'crypto_payment', balance: account.balance,
    });

    return { success: true, referenceNumber: ref, payment, receiptUrl, hostedUrl };
  }

  // ── History ───────────────────────────────────────────────────
  async getHistory(userId: string) {
    return this.cryptoModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }
}

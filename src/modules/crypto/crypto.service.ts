import {
  Injectable, BadRequestException, NotFoundException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { CryptoPayment, CryptoPaymentDocument, CryptoStatus } from './schemas/crypto-payment.schema';
import { CryptoInvestment, CryptoInvestmentDocument } from './schemas/crypto-investment.schema';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import { Transaction, TransactionDocument, TransactionType, TransactionStatus, TransactionDirection } from '../transactions/schemas/transaction.schema';
import { OtpService } from '../otp/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { generateReference } from '../../common/utils/generate-ref.util';
import { InitiateCryptoDto } from './dto/crypto-payment.dto';
import { BuyCryptoInvestDto, SellCryptoInvestDto } from './dto/crypto-investment.dto';

// ── COIN_NAMES must be outside the class — not inside the constructor/body ──
const COIN_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',   ETH: 'Ethereum', SOL: 'Solana',   BNB: 'BNB',
  ADA: 'Cardano',   AVAX: 'Avalanche', DOGE: 'Dogecoin',
  MATIC: 'Polygon', LTC: 'Litecoin', XRP: 'XRP',
};

// CoinGecko IDs for exchange rate fetching
// Add more coins here as needed — must match COIN_NAMES keys
const COINGECKO_IDS: Record<string, string> = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  BNB:  'binancecoin',
  ADA:  'cardano',
  AVAX: 'avalanche-2',
  DOGE: 'dogecoin',
  MATIC:'matic-network',
  LTC:  'litecoin',
  XRP:  'ripple',
};

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly coinbaseKey: string;

  constructor(
    @InjectModel(CryptoPayment.name)
    private readonly cryptoModel: Model<CryptoPaymentDocument>,

    // ← The investment model — separate collection from CryptoPayment
    @InjectModel(CryptoInvestment.name)
    private readonly cryptoInvestModel: Model<CryptoInvestmentDocument>,

    @InjectModel(Account.name)
    private readonly accountModel: Model<AccountDocument>,

    @InjectModel(Transaction.name)
    private readonly txModel: Model<TransactionDocument>,

    private readonly config:               ConfigService,
    private readonly otpService:           OtpService,
    private readonly notificationsService: NotificationsService,
    private readonly receiptsService:      ReceiptsService,
  ) {
    this.coinbaseKey = config.get<string>('COINBASE_COMMERCE_API_KEY', '');
  }

  // ══════════════════════════════════════════════════════════════
  // EXCHANGE RATES
  // ══════════════════════════════════════════════════════════════

  async getExchangeRates(): Promise<Record<string, number>> {
    try {
      const ids = Object.values(COINGECKO_IDS).join(',');
      const { data } = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        { timeout: 5000 },
      );
      const rates: Record<string, number> = {};
      for (const [sym, id] of Object.entries(COINGECKO_IDS)) {
        rates[sym] = (data as any)[id]?.usd ?? 0;
      }
      return rates;
    } catch {
      this.logger.warn('CoinGecko rate fetch failed — using fallback rates');
      return {
        BTC: 67000, ETH: 3500, SOL: 170, BNB: 600,
        ADA: 0.45,  AVAX: 35,  DOGE: 0.12,
        MATIC: 0.70, LTC: 85,  XRP: 0.50,
      };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CRYPTO INVESTMENT — BUY
  // POST /crypto/invest/buy
  // ══════════════════════════════════════════════════════════════

  async buyCryptoInvestment(userId: string, dto: BuyCryptoInvestDto) {
    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(dto.accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.status === 'frozen')
      throw new BadRequestException('Account is frozen');

    const rates  = await this.getExchangeRates();
    const symbol = dto.symbol.toUpperCase();
    const rate   = rates[symbol];
    if (!rate)
      throw new BadRequestException(
        `Unsupported coin: ${symbol}. Supported: ${Object.keys(rates).join(', ')}`,
      );

    const coinName    = COIN_NAMES[symbol] ?? symbol;
    const cryptoAmount = +(dto.amountUSD / rate).toFixed(8);
    const fee         = +(dto.amountUSD * 0.001).toFixed(2);   // 0.1% brokerage
    const totalDebit  = +(dto.amountUSD + fee).toFixed(2);

    if (account.availableBalance < totalDebit)
      throw new BadRequestException(
        `Insufficient funds. Required: $${totalDebit}, Available: $${account.availableBalance.toFixed(2)}`,
      );

    const ref = generateReference('CINV');

    // Debit account
    account.balance          -= totalDebit;
    account.availableBalance -= totalDebit;
    account.totalWithdrawn   += totalDebit;
    await account.save();

    // Create investment position — stored in crypto_investments collection
    await this.cryptoInvestModel.create({
      userId:           new Types.ObjectId(userId),
      accountId:        account._id,
      symbol,
      coinName,
      amountUSD:        dto.amountUSD,
      cryptoAmount,
      buyPrice:         rate,
      currentPrice:     rate,
      currentValue:     dto.amountUSD,
      profitLoss:       0,
      profitLossPercent:0,
      action:           'buy',
      orderStatus:      'pending',
      referenceNumber:  ref,
    });

    // Record in transactions for user history
    await this.txModel.create({
      userId:          new Types.ObjectId(userId),
      accountId:       account._id,
      referenceNumber: ref,
      type:            TransactionType.CRYPTO_PURCHASE,
      status:          TransactionStatus.COMPLETED,
      direction:       TransactionDirection.DEBIT,
      amount:          dto.amountUSD,
      fee,
      currency:        'USD',
      description:     `Bought ${cryptoAmount.toFixed(6)} ${symbol} @ $${rate.toFixed(2)}`,
      balanceAfter:    account.balance,
      processedAt:     new Date(),
      metadata:        { symbol, coinName, cryptoAmount, buyPrice: rate },
    });

    return {
      success:         true,
      referenceNumber: ref,
      symbol,
      coinName,
      cryptoAmount,
      buyPrice:        rate,
      amountUSD:       dto.amountUSD,
      fee,
      totalDebit,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // CRYPTO INVESTMENT — SELL
  // POST /crypto/invest/sell
  // ══════════════════════════════════════════════════════════════

  async sellCryptoInvestment(userId: string, dto: SellCryptoInvestDto) {
    
    const investment = await this.cryptoInvestModel.findOne({
    _id:         new Types.ObjectId(dto.investmentId),
    userId:      new Types.ObjectId(userId),
    action:      'buy',
    orderStatus: 'filled',   // ← ONLY filled positions can be sold
  });
  if (!investment) throw new NotFoundException(
    'Investment position not found or not yet approved. Wait for admin approval before selling.',
  );

    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(dto.accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');

    const rates     = await this.getExchangeRates();
    const sellPrice = rates[investment.symbol];
    if (!sellPrice)
      throw new BadRequestException(`Cannot get current price for ${investment.symbol}`);

    const grossUSD = +(investment.cryptoAmount * sellPrice).toFixed(2);
    const fee      = +(grossUSD * 0.001).toFixed(2);
    const netUSD   = +(grossUSD - fee).toFixed(2);
    const pnl      = +(netUSD - investment.amountUSD).toFixed(2);
    const pnlPct   = +((pnl / investment.amountUSD) * 100).toFixed(2);

    const ref = generateReference('CSEL');

    // Credit account
    account.balance          += netUSD;
    account.availableBalance += netUSD;
    account.totalDeposited   += netUSD;
    await account.save();

    // Mark investment as sold in crypto_investments collection
    await this.cryptoInvestModel.findByIdAndUpdate(dto.investmentId, {
      action:           'sell',
      orderStatus:      'filled',
      sellPrice,
      sellAmountUSD:    netUSD,
      soldAt:           new Date(),
      currentPrice:     sellPrice,
      currentValue:     grossUSD,
      profitLoss:       pnl,
      profitLossPercent:pnlPct,
    });

    // Record in transactions
    await this.txModel.create({
      userId:          new Types.ObjectId(userId),
      accountId:       account._id,
      referenceNumber: ref,
      type:            TransactionType.CRYPTO_SALE,
      status:          TransactionStatus.COMPLETED,
      direction:       TransactionDirection.CREDIT,
      amount:          netUSD,
      fee,
      currency:        'USD',
      description:     `Sold ${investment.cryptoAmount.toFixed(6)} ${investment.symbol} @ $${sellPrice.toFixed(2)}`,
      balanceAfter:    account.balance,
      processedAt:     new Date(),
      metadata:        {
        symbol:       investment.symbol,
        cryptoAmount: investment.cryptoAmount,
        sellPrice,
        pnl,
      },
    });

    return {
      success:           true,
      referenceNumber:   ref,
      symbol:            investment.symbol,
      cryptoAmount:      investment.cryptoAmount,
      sellPrice,
      grossUSD,
      fee,
      netUSD,
      profitLoss:        pnl,
      profitLossPercent: pnlPct,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // CRYPTO INVESTMENT — PORTFOLIO
  // GET /crypto/invest/portfolio
  // ══════════════════════════════════════════════════════════════

  async getCryptoPortfolio(userId: string) {
    const rates = await this.getExchangeRates().catch(() => ({} as Record<string, number>));

    // Only active BUY positions (not sold)
   const positions = await this.cryptoInvestModel
      .find({
        userId:      new Types.ObjectId(userId),
        action:      'buy',
        orderStatus: { $in: ['pending', 'filled'] },
      })
      .sort({ createdAt: -1 })
      .lean();
 

    let totalInvested = 0;
    let totalValue    = 0;

     const enriched = positions.map(pos => {
      const isPending    = pos.orderStatus === 'pending';
      const livePrice    = isPending ? pos.buyPrice : (rates[pos.symbol] ?? pos.buyPrice);
      const currentValue = isPending
        ? pos.amountUSD                                          // show invested amount for pending
        : +(pos.cryptoAmount * livePrice).toFixed(2);
      const profitLoss   = isPending ? 0 : +(currentValue - pos.amountUSD).toFixed(2);
      const profitLossPercent = isPending || pos.amountUSD === 0
        ? 0
        : +((profitLoss / pos.amountUSD) * 100).toFixed(2);
      totalInvested += pos.amountUSD;
      totalValue    += currentValue;
      return {
        ...pos,
        currentPrice: livePrice,
        currentValue,
        profitLoss,
        profitLossPercent,
      };
    });
 

    const totalProfitLoss    = +(totalValue - totalInvested).toFixed(2);
    const totalProfitLossPct = totalInvested > 0
      ? +((totalProfitLoss / totalInvested) * 100).toFixed(2)
      : 0;

    return {
      positions: enriched,
      summary: {
        totalInvested:    +totalInvested.toFixed(2),
        totalValue:       +totalValue.toFixed(2),
        totalProfitLoss,
        totalProfitLossPct,
        positionCount:    enriched.length,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  // CRYPTO PAYMENT — kept for backward compat (initiate/confirm)
  // These are for the send-crypto flow if still needed elsewhere
  // ══════════════════════════════════════════════════════════════

  async initiate(userId: string, dto: Omit<InitiateCryptoDto, 'otp'>, userEmail: string) {
    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(dto.accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');

    const rates = await this.getExchangeRates();
    const rate  = rates[dto.cryptocurrency];
    if (!rate)
      throw new BadRequestException(`Unsupported cryptocurrency: ${dto.cryptocurrency}`);

    const cryptoAmount = +(dto.amountUSD / rate).toFixed(8);
    const fee          = +(dto.amountUSD * 0.015).toFixed(2);
    const totalUSD     = +(dto.amountUSD + fee).toFixed(2);

    if (account.availableBalance < totalUSD)
      throw new BadRequestException(`Insufficient funds. Required: $${totalUSD}`);

    const otp = this.otpService.generate();
    this.otpService.save(this.otpService.buildKey(userId, 'crypto_payment'), otp);
    await this.notificationsService.sendOtpEmail(userEmail, otp, 'transfer_confirmation');

    return {
      message:     'OTP sent. Confirm to complete crypto payment.',
      preview:     { amountUSD: dto.amountUSD, cryptocurrency: dto.cryptocurrency, cryptoAmount, exchangeRate: rate, fee, totalUSD },
      requiresOtp: true,
    };
  }

  async confirm(userId: string, dto: InitiateCryptoDto, user: any) {
    if (!dto.otp || dto.otp.length !== 6)
      throw new BadRequestException('A valid 6-digit OTP is required');

    this.otpService.verify(this.otpService.buildKey(userId, 'crypto_payment'), dto.otp);

    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(dto.accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');

    const rates        = await this.getExchangeRates();
    const rate         = rates[dto.cryptocurrency];
    const cryptoAmount = +(dto.amountUSD / rate).toFixed(8);
    const fee          = +(dto.amountUSD * 0.015).toFixed(2);
    const totalUSD     = +(dto.amountUSD + fee).toFixed(2);

    if (account.availableBalance < totalUSD)
      throw new BadRequestException('Insufficient funds');

    const ref = generateReference('CRYPTO');

    let chargeId = '', chargeCode = '', hostedUrl = '';
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
        { headers: { 'X-CC-Api-Key': this.coinbaseKey, 'X-CC-Version': '2018-03-22', 'Content-Type': 'application/json' } },
      );
      chargeId   = (data as any).data?.id ?? '';
      chargeCode = (data as any).data?.code ?? '';
      hostedUrl  = (data as any).data?.hosted_url ?? '';
    } catch (err) {
      this.logger.warn('Coinbase Commerce charge creation failed', err);
    }

    account.balance          -= totalUSD;
    account.availableBalance -= totalUSD;
    account.totalWithdrawn   += totalUSD;
    await account.save();

    const payment = await this.cryptoModel.create({
      userId:             new Types.ObjectId(userId),
      accountId:          account._id,
      cryptocurrency:     dto.cryptocurrency,
      amountUSD:          dto.amountUSD,
      cryptoAmount,
      exchangeRate:       rate,
      recipientAddress:   dto.recipientAddress,
      recipientName:      dto.recipientName,
      coinbaseChargeId:   chargeId,
      coinbaseChargeCode: chargeCode,
      hostedUrl,
      status:             CryptoStatus.PENDING,
      referenceNumber:    ref,
      description:        dto.description,
    });

    const tx = await this.txModel.create({
      userId:          new Types.ObjectId(userId),
      accountId:       account._id,
      referenceNumber: ref,
      type:            TransactionType.CRYPTO_PAYMENT,
      status:          TransactionStatus.PROCESSING,
      direction:       TransactionDirection.DEBIT,
      amount:          dto.amountUSD,
      fee,
      currency:        'USD',
      description:     `Crypto Payment — ${cryptoAmount} ${dto.cryptocurrency}`,
      balanceAfter:    account.balance,
      processedAt:     new Date(),
      metadata:        { cryptocurrency: dto.cryptocurrency, cryptoAmount, exchangeRate: rate, chargeId },
    });

    const receiptUrl = await this.receiptsService.generatePdfReceipt(tx).catch(() => '');

    await this.notificationsService.sendTransferAlert(user.email, {
      direction: 'debit', amount: dto.amountUSD, fee, ref, type: 'crypto_payment', balance: account.balance,
    }).catch(() => null);

    return { success: true, referenceNumber: ref, payment, receiptUrl, hostedUrl };
  }

  async getHistory(userId: string) {
    return this.cryptoModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }
}
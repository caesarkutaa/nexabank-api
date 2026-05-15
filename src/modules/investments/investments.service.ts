import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import { Investment, InvestmentDocument, OrderAction, OrderStatus } from './schemas/investment.schema';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import { Transaction, TransactionDocument, TransactionType, TransactionStatus, TransactionDirection } from '../transactions/schemas/transaction.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { generateReference } from '../../common/utils/generate-ref.util';
import { BuyStockDto, SellStockDto } from './dto/buy-stock.dto';

// Yahoo Finance public headers — no API key needed
const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

@Injectable()
export class InvestmentsService {
  private readonly logger = new Logger(InvestmentsService.name);

  constructor(
    @InjectModel(Investment.name) private investmentModel: Model<InvestmentDocument>,
    @InjectModel(Account.name)    private accountModel:    Model<AccountDocument>,
    @InjectModel(Transaction.name) private txModel:        Model<TransactionDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Get Real-Time Quote (Yahoo Finance public API — no key needed) ─────────
  async getQuote(symbol: string) {
    const sym = symbol.toUpperCase();
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`;
      const { data } = await axios.get(url, { headers: YF_HEADERS, timeout: 8000 });

      const result = data?.chart?.result?.[0];
      if (!result) throw new Error('No data returned');

      const meta  = result.meta as Record<string, any>;
      const price: number = meta.regularMarketPrice ?? meta.previousClose ?? 0;
      const prev:  number = meta.previousClose ?? meta.chartPreviousClose ?? price;
      const change        = +(price - prev).toFixed(4);
      const changePct     = prev > 0 ? +((change / prev) * 100).toFixed(4) : 0;

      return {
        symbol:           sym,
        askPrice:         price,
        bidPrice:         price,
        midPrice:         price,
        change,
        changePercent:    changePct,
        companyName:      (meta.longName ?? meta.shortName ?? sym) as string,
        currency:         (meta.currency ?? 'USD') as string,
        marketState:      (meta.marketState ?? 'REGULAR') as string,
        fiftyTwoWeekHigh: (meta.fiftyTwoWeekHigh ?? 0) as number,
        fiftyTwoWeekLow:  (meta.fiftyTwoWeekLow  ?? 0) as number,
        volume:           (meta.regularMarketVolume ?? 0) as number,
        timestamp:        new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.error(`Yahoo Finance quote failed for ${sym}: ${err.message}`);
      throw new BadRequestException(
        `Could not fetch quote for "${sym}". Check the ticker symbol is valid (e.g. AAPL, MSFT, TSLA).`,
      );
    }
  }

  // ── Search Stocks (Yahoo Finance autocomplete — no key needed) ─────────────
  async searchStocks(query: string) {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;
      const { data } = await axios.get(url, { headers: YF_HEADERS, timeout: 8000 });

      return ((data?.quotes ?? []) as any[])
        .filter((q: any) => q.quoteType === 'EQUITY' && q.symbol)
        .slice(0, 15)
        .map((q: any) => ({
          symbol:       q.symbol      as string,
          name:         (q.longname ?? q.shortname ?? q.symbol) as string,
          exchange:     (q.exchange ?? '') as string,
          tradable:     true,
          fractionable: false,
        }));
    } catch (err: any) {
      this.logger.error(`Stock search failed: ${err.message}`);
      throw new BadRequestException('Stock search failed. Try a different query.');
    }
  }

  // ── Buy Stock ──────────────────────────────────────────────────────────────
  async buyStock(userId: string, dto: BuyStockDto, userEmail: string) {
    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(dto.accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.status !== 'active') throw new BadRequestException('Account is not active');

    // Get live price from Yahoo Finance
    const quote         = await this.getQuote(dto.symbol);
    const pricePerShare = quote.midPrice;
    const totalCost     = +(pricePerShare * dto.shares).toFixed(2);
    const fee           = +(totalCost * 0.001).toFixed(2);   // 0.1% brokerage fee
    const totalDebit    = +(totalCost + fee).toFixed(2);

    if (account.availableBalance < totalDebit) {
      throw new BadRequestException(
        `Insufficient funds. Required: $${totalDebit.toFixed(2)}, Available: $${account.availableBalance.toFixed(2)}`,
      );
    }

    const ref = generateReference('INV');

    // Debit account
    account.balance          -= totalDebit;
    account.availableBalance -= totalDebit;
    account.totalWithdrawn   += totalDebit;
    await account.save();

    // Record transaction
    await this.txModel.create({
      userId:          new Types.ObjectId(userId),
      accountId:       account._id,
      referenceNumber: ref,
      type:            TransactionType.INVESTMENT,
      status:          TransactionStatus.COMPLETED,
      direction:       TransactionDirection.DEBIT,
      amount:          totalCost,
      fee,
      currency:        'USD',
      description:     `Buy ${dto.shares} shares of ${dto.symbol.toUpperCase()} @ $${pricePerShare}`,
      balanceAfter:    account.balance,
      processedAt:     new Date(),
      metadata:        { symbol: dto.symbol, shares: dto.shares, pricePerShare, source: 'yahoo_finance' },
    });

    // Record investment position
    const investment = await this.investmentModel.create({
      userId:          new Types.ObjectId(userId),
      accountId:       account._id,
      symbol:          dto.symbol.toUpperCase(),
      companyName:     quote.companyName,
      shares:          dto.shares,
      buyPrice:        pricePerShare,
      currentPrice:    pricePerShare,
      totalInvested:   totalCost,
      currentValue:    totalCost,
      profitLoss:      0,
      profitLossPercent: 0,
      action:          OrderAction.BUY,
      orderStatus:     OrderStatus.PENDING,
      alpacaOrderId:   '',                   
      referenceNumber: ref,
    });

    return {
      success:         true,
      referenceNumber: ref,
      symbol:          dto.symbol.toUpperCase(),
      shares:          dto.shares,
      pricePerShare,
      totalCost,
      fee,
      totalDebit,
      investment,
      message: `Successfully bought ${dto.shares} share${dto.shares !== 1 ? 's' : ''} of ${dto.symbol.toUpperCase()} at $${pricePerShare} per share.`,
    };
  }

  // ── Sell Stock ─────────────────────────────────────────────────────────────
  async sellStock(userId: string, dto: SellStockDto, userEmail: string) {
     const investment = await this.investmentModel.findOne({
    _id:         new Types.ObjectId(dto.investmentId),
    userId:      new Types.ObjectId(userId),
    action:      OrderAction.BUY,
    orderStatus: OrderStatus.FILLED,   // ← ONLY filled positions can be sold
  });
  if (!investment) throw new NotFoundException(
    'Investment position not found or not yet approved. Wait for admin approval before selling.',
  );
 
    if (!investment) throw new NotFoundException('Investment position not found');
    if (dto.sharesToSell > investment.shares) {
      throw new BadRequestException(
        `Cannot sell ${dto.sharesToSell} shares — you only own ${investment.shares}.`,
      );
    }

    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(dto.accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');

    // Get current price
    const quote       = await this.getQuote(investment.symbol);
    const sellPrice   = quote.midPrice;
    const proceeds    = +(sellPrice * dto.sharesToSell).toFixed(2);
    const fee         = +(proceeds * 0.001).toFixed(2);
    const netProceeds = +(proceeds - fee).toFixed(2);
    const costBasis   = +(investment.buyPrice * dto.sharesToSell).toFixed(2);
    const profitLoss  = +(netProceeds - costBasis).toFixed(2);
    const ref         = generateReference('INV');

    // Update or close the position
    const remainingShares = +(investment.shares - dto.sharesToSell).toFixed(6);
    if (remainingShares <= 0) {
      await this.investmentModel.findByIdAndDelete(investment._id);
    } else {
      await this.investmentModel.findByIdAndUpdate(investment._id, {
        shares:        remainingShares,
        totalInvested: +(investment.buyPrice * remainingShares).toFixed(2),
        currentPrice:  sellPrice,
        currentValue:  +(sellPrice * remainingShares).toFixed(2),
      });
    }

    // Credit account
    account.balance          += netProceeds;
    account.availableBalance += netProceeds;
    account.totalDeposited   += netProceeds;
    await account.save();

    // Record sell transaction
    await this.txModel.create({
      userId:          new Types.ObjectId(userId),
      accountId:       account._id,
      referenceNumber: ref,
      type:            TransactionType.INVESTMENT,
      status:          TransactionStatus.COMPLETED,
      direction:       TransactionDirection.CREDIT,
      amount:          netProceeds,
      fee,
      currency:        'USD',
      description:     `Sell ${dto.sharesToSell} shares of ${investment.symbol} @ $${sellPrice}`,
      balanceAfter:    account.balance,
      processedAt:     new Date(),
      metadata:        { symbol: investment.symbol, shares: dto.sharesToSell, sellPrice, profitLoss, source: 'yahoo_finance' },
    });

    // Record sell entry for history
    await this.investmentModel.create({
      userId:          new Types.ObjectId(userId),
      accountId:       account._id,
      symbol:          investment.symbol,
      companyName:     investment.companyName,
      shares:          dto.sharesToSell,
      buyPrice:        sellPrice,
      currentPrice:    sellPrice,
      totalInvested:   proceeds,
      currentValue:    netProceeds,
      profitLoss,
      action:          OrderAction.SELL,
      orderStatus:     OrderStatus.FILLED,
      referenceNumber: ref,
      filledAt:        new Date(),
    });

    return {
      success:         true,
      referenceNumber: ref,
      netProceeds,
      profitLoss,
      fee,
      message: `Successfully sold ${dto.sharesToSell} share${dto.sharesToSell !== 1 ? 's' : ''} of ${investment.symbol}. Net proceeds: $${netProceeds}.`,
    };
  }

  // ── Portfolio (with live prices) ───────────────────────────────────────────
  async getPortfolio(userId: string) {
     const positions = await this.investmentModel
    .find({
      userId:      new Types.ObjectId(userId),
      action:      OrderAction.BUY,
      orderStatus: { $in: [OrderStatus.FILLED, OrderStatus.PENDING] },
    })
    .lean();
    let totalInvested = 0;
    let totalValue    = 0;

    const enriched = await Promise.all(
      positions.map(async (p) => {
        // Pending orders haven't been filled yet — use stored values
        if (p.orderStatus === OrderStatus.PENDING) {
          totalInvested += p.totalInvested;
          totalValue    += p.totalInvested; // same as invested until filled
          return { ...p, currentPrice: p.buyPrice, currentValue: p.totalInvested, profitLoss: 0, profitLossPercent: 0 };
        }
        try {
          const quote      = await this.getQuote(p.symbol);
          const currentVal = +(quote.midPrice * p.shares).toFixed(2);
          const pl         = +(currentVal - p.totalInvested).toFixed(2);
          const plPct      = p.totalInvested > 0 ? +((pl / p.totalInvested) * 100).toFixed(2) : 0;
          totalInvested   += p.totalInvested;
          totalValue      += currentVal;
          return { ...p, currentPrice: quote.midPrice, currentValue: currentVal, profitLoss: pl, profitLossPercent: plPct, change: quote.change, changePercent: quote.changePercent };
        } catch {
          totalInvested += p.totalInvested;
          totalValue    += p.currentValue;
          return p;
        }
      }),
    );
 

    const totalProfitLoss    = +(totalValue - totalInvested).toFixed(2);
    const totalProfitLossPct = totalInvested > 0
      ? +((totalProfitLoss / totalInvested) * 100).toFixed(2)
      : 0;

    return {
      positions: enriched,
      summary: {
        totalInvested,
        totalValue,
        totalProfitLoss,
        totalProfitLossPct,
        positionCount: enriched.length,
      },
    };
  }

  // ── History ────────────────────────────────────────────────────────────────
  async getHistory(userId: string) {
    return this.investmentModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }
}
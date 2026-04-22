import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Investment, InvestmentDocument, OrderAction, OrderStatus } from './schemas/investment.schema';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import { Transaction, TransactionDocument, TransactionType, TransactionStatus, TransactionDirection } from '../transactions/schemas/transaction.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { generateReference } from '../../common/utils/generate-ref.util';
import { BuyStockDto, SellStockDto } from './dto/buy-stock.dto';

@Injectable()
export class InvestmentsService {
  private readonly logger = new Logger(InvestmentsService.name);
  private readonly alpacaHeaders: Record<string, string>;
  private readonly alpacaBase: string;

  constructor(
    @InjectModel(Investment.name) private investmentModel: Model<InvestmentDocument>,
    @InjectModel(Account.name)    private accountModel:    Model<AccountDocument>,
    @InjectModel(Transaction.name) private txModel:        Model<TransactionDocument>,
    private readonly config:               ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.alpacaBase    = config.get<string>('ALPACA_BASE_URL', 'https://paper-api.alpaca.markets');
    this.alpacaHeaders = {
      'APCA-API-KEY-ID':     config.get<string>('ALPACA_API_KEY', ''),
      'APCA-API-SECRET-KEY': config.get<string>('ALPACA_SECRET_KEY', ''),
      'Content-Type':        'application/json',
    };
  }

  // ── Get Real-Time Quote ───────────────────────────────────────
  async getQuote(symbol: string) {
    try {
      const { data } = await axios.get(
        `https://data.alpaca.markets/v2/stocks/${symbol.toUpperCase()}/quotes/latest`,
        { headers: this.alpacaHeaders },
      );
      const quote = data.quote;
      return {
        symbol:    symbol.toUpperCase(),
        askPrice:  quote.ap,
        bidPrice:  quote.bp,
        midPrice:  +((quote.ap + quote.bp) / 2).toFixed(4),
        timestamp: quote.t,
      };
    } catch {
      throw new BadRequestException(`Could not fetch quote for symbol: ${symbol}`);
    }
  }

  // ── Search Stocks ─────────────────────────────────────────────
  async searchStocks(query: string) {
    try {
      const { data } = await axios.get(
        `${this.alpacaBase}/v2/assets?status=active&asset_class=us_equity&attributes=&search=${query}`,
        { headers: this.alpacaHeaders },
      );
      return (data as any[]).slice(0, 20).map((a) => ({
        symbol:    a.symbol,
        name:      a.name,
        exchange:  a.exchange,
        tradable:  a.tradable,
        fractionable: a.fractionable,
      }));
    } catch {
      throw new BadRequestException('Stock search failed');
    }
  }

  // ── Buy Stock ─────────────────────────────────────────────────
  async buyStock(userId: string, dto: BuyStockDto, userEmail: string) {
    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(dto.accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');

    // Get current price
    const quote      = await this.getQuote(dto.symbol);
    const pricePerShare = quote.midPrice;
    const totalCost     = +(pricePerShare * dto.shares).toFixed(2);
    const fee           = +(totalCost * 0.001).toFixed(2); // 0.1% brokerage fee
    const totalDebit    = +(totalCost + fee).toFixed(2);

    if (account.availableBalance < totalDebit)
      throw new BadRequestException(`Insufficient funds. Required: $${totalDebit}, Available: $${account.availableBalance}`);

    // Get asset info
    let companyName = dto.symbol;
    try {
      const { data } = await axios.get(
        `${this.alpacaBase}/v2/assets/${dto.symbol.toUpperCase()}`,
        { headers: this.alpacaHeaders },
      );
      companyName = (data as any).name ?? dto.symbol;
    } catch { /* use symbol as name */ }

    // Place order on Alpaca
    let alpacaOrderId = '';
    let orderStatus   = OrderStatus.FILLED;
    try {
      const { data: order } = await axios.post(
        `${this.alpacaBase}/v2/orders`,
        {
          symbol:        dto.symbol.toUpperCase(),
          qty:           dto.shares,
          side:          'buy',
          type:          'market',
          time_in_force: 'day',
        },
        { headers: this.alpacaHeaders },
      );
      alpacaOrderId = (order as any).id;
      orderStatus   = (order as any).status === 'filled' ? OrderStatus.FILLED : OrderStatus.PENDING;
    } catch (err) {
      this.logger.warn('Alpaca order failed, recording locally', err);
    }

    const ref = generateReference('INV');

    // Debit account
    account.balance          -= totalDebit;
    account.availableBalance -= totalDebit;
    account.totalWithdrawn   += totalDebit;
    await account.save();

    // Record transaction
    await this.txModel.create({
      userId:      new Types.ObjectId(userId),
      accountId:   account._id,
      referenceNumber: ref,
      type:        TransactionType.INVESTMENT,
      status:      TransactionStatus.COMPLETED,
      direction:   TransactionDirection.DEBIT,
      amount:      totalCost,
      fee,
      currency:    'USD',
      description: `Buy ${dto.shares} shares of ${dto.symbol.toUpperCase()}`,
      balanceAfter: account.balance,
      processedAt: new Date(),
      metadata:    { symbol: dto.symbol, shares: dto.shares, pricePerShare },
    });

    // Record investment
    const investment = await this.investmentModel.create({
      userId:        new Types.ObjectId(userId),
      accountId:     account._id,
      symbol:        dto.symbol.toUpperCase(),
      companyName,
      shares:        dto.shares,
      buyPrice:      pricePerShare,
      currentPrice:  pricePerShare,
      totalInvested: totalCost,
      currentValue:  totalCost,
      profitLoss:    0,
      profitLossPercent: 0,
      action:        OrderAction.BUY,
      orderStatus,
      alpacaOrderId,
      referenceNumber: ref,
      filledAt:      new Date(),
    });

    return {
      success: true,
      referenceNumber: ref,
      symbol:  dto.symbol.toUpperCase(),
      shares:  dto.shares,
      pricePerShare,
      totalCost,
      fee,
      totalDebit,
      investment,
    };
  }

  // ── Sell Stock ────────────────────────────────────────────────
  async sellStock(userId: string, dto: SellStockDto, userEmail: string) {
    const investment = await this.investmentModel.findOne({
      _id:    new Types.ObjectId(dto.investmentId),
      userId: new Types.ObjectId(userId),
      action: OrderAction.BUY,
    });
    if (!investment) throw new NotFoundException('Investment position not found');
    if (dto.sharesToSell > investment.shares)
      throw new BadRequestException(`Cannot sell ${dto.sharesToSell} shares. You own ${investment.shares}.`);

    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(dto.accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');

    const quote          = await this.getQuote(investment.symbol);
    const sellPrice      = quote.midPrice;
    const proceeds       = +(sellPrice * dto.sharesToSell).toFixed(2);
    const fee            = +(proceeds * 0.001).toFixed(2);
    const netProceeds    = +(proceeds - fee).toFixed(2);
    const costBasis      = +(investment.buyPrice * dto.sharesToSell).toFixed(2);
    const profitLoss     = +(netProceeds - costBasis).toFixed(2);
    const ref            = generateReference('INV');

    // Place sell order on Alpaca
    try {
      await axios.post(
        `${this.alpacaBase}/v2/orders`,
        {
          symbol:        investment.symbol,
          qty:           dto.sharesToSell,
          side:          'sell',
          type:          'market',
          time_in_force: 'day',
        },
        { headers: this.alpacaHeaders },
      );
    } catch (err) {
      this.logger.warn('Alpaca sell order failed, recording locally', err);
    }

    // Update or close position
    const remainingShares = investment.shares - dto.sharesToSell;
    if (remainingShares <= 0) {
      await this.investmentModel.findByIdAndDelete(investment._id);
    } else {
      await this.investmentModel.findByIdAndUpdate(investment._id, {
        shares:       remainingShares,
        totalInvested: +(investment.buyPrice * remainingShares).toFixed(2),
        currentPrice: sellPrice,
        currentValue: +(sellPrice * remainingShares).toFixed(2),
      });
    }

    // Credit account
    account.balance          += netProceeds;
    account.availableBalance += netProceeds;
    account.totalDeposited   += netProceeds;
    await account.save();

    // Record sell transaction
    await this.txModel.create({
      userId:      new Types.ObjectId(userId),
      accountId:   account._id,
      referenceNumber: ref,
      type:        TransactionType.INVESTMENT,
      status:      TransactionStatus.COMPLETED,
      direction:   TransactionDirection.CREDIT,
      amount:      netProceeds,
      fee,
      currency:    'USD',
      description: `Sell ${dto.sharesToSell} shares of ${investment.symbol}`,
      balanceAfter: account.balance,
      processedAt: new Date(),
      metadata:    { symbol: investment.symbol, shares: dto.sharesToSell, sellPrice, profitLoss },
    });

    // Record sell investment entry
    await this.investmentModel.create({
      userId:        new Types.ObjectId(userId),
      accountId:     account._id,
      symbol:        investment.symbol,
      companyName:   investment.companyName,
      shares:        dto.sharesToSell,
      buyPrice:      sellPrice,
      currentPrice:  sellPrice,
      totalInvested: proceeds,
      currentValue:  netProceeds,
      profitLoss,
      action:        OrderAction.SELL,
      orderStatus:   OrderStatus.FILLED,
      referenceNumber: ref,
      filledAt:      new Date(),
    });

    return { success: true, referenceNumber: ref, netProceeds, profitLoss, fee };
  }

  // ── Portfolio ─────────────────────────────────────────────────
  async getPortfolio(userId: string) {
    const positions = await this.investmentModel
      .find({ userId: new Types.ObjectId(userId), action: OrderAction.BUY })
      .lean();

    let totalInvested = 0;
    let totalValue    = 0;

    const enriched = await Promise.all(
      positions.map(async (p) => {
        try {
          const quote       = await this.getQuote(p.symbol);
          const currentVal  = +(quote.midPrice * p.shares).toFixed(2);
          const pl          = +(currentVal - p.totalInvested).toFixed(2);
          const plPct       = +((pl / p.totalInvested) * 100).toFixed(2);
          totalInvested    += p.totalInvested;
          totalValue       += currentVal;
          return { ...p, currentPrice: quote.midPrice, currentValue: currentVal, profitLoss: pl, profitLossPercent: plPct };
        } catch {
          totalInvested += p.totalInvested;
          totalValue    += p.currentValue;
          return p;
        }
      }),
    );

    const totalProfitLoss    = +(totalValue - totalInvested).toFixed(2);
    const totalProfitLossPct = totalInvested > 0 ? +((totalProfitLoss / totalInvested) * 100).toFixed(2) : 0;

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

  // ── History ───────────────────────────────────────────────────
  async getHistory(userId: string) {
    return this.investmentModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }
}
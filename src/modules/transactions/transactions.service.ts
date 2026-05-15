import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction, TransactionDocument, TransactionType, TransactionDirection } from './schemas/transaction.schema';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
  ) {}

 

async getTransactions(userId: string, query: any) {
  const filter: any = { userId: new Types.ObjectId(userId) };
 
  if (query.type)      filter.type      = query.type;
  if (query.direction) filter.direction = query.direction;
  if (query.status)    filter.status    = query.status;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to)   filter.createdAt.$lte = new Date(query.to);
  }
 
  const page  = Number(query.page)  || 1;
  const limit = Number(query.limit) || 20;
 
  const [transactions, total] = await Promise.all([
    this.txModel
      .find(filter)
      .select('-metadata')          
      .sort({ processedAt: -1, createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    this.txModel.countDocuments(filter),
  ]);
 
  return {
    transactions,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
}
 


  async getTransactionById(txId: string, userId: string) {
    const tx = await this.txModel.findOne({
      _id:    new Types.ObjectId(txId),
      userId: new Types.ObjectId(userId),
    }).lean();
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async getMonthlyAnalytics(userId: string) {
    const now        = new Date();
    const months: any[] = [];

    for (let m = 5; m >= 0; m--) {
      const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const end   = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59);

      const [result] = await this.txModel.aggregate([
        {
          $match: {
            userId:    new Types.ObjectId(userId),
            status:    'completed',
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id:          null,
            totalCredit:  { $sum: { $cond: [{ $eq: ['$direction', 'credit'] }, '$amount', 0] } },
            totalDebit:   { $sum: { $cond: [{ $eq: ['$direction', 'debit']  }, '$amount', 0] } },
            totalFees:    { $sum: '$fee' },
            count:        { $sum: 1 },
          },
        },
      ]);

      months.push({
        month:       start.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
        credit:      result?.totalCredit  ?? 0,
        debit:       result?.totalDebit   ?? 0,
        fees:        result?.totalFees    ?? 0,
        count:       result?.count        ?? 0,
      });
    }

    return months;
  }

  async getSpendingByCategory(userId: string) {
    return this.txModel.aggregate([
      {
        $match: {
          userId:    new Types.ObjectId(userId),
          direction: TransactionDirection.DEBIT,
          status:    'completed',
          createdAt: { $gte: new Date(new Date().setDate(1)) },
        },
      },
      {
        $group: {
          _id:   '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);
  }
}
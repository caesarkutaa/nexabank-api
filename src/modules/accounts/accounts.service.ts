import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Account, AccountDocument, AccountType, AccountStatus } from './schemas/account.schema';
import { Transaction, TransactionDocument, TransactionDirection } from '../transactions/schemas/transaction.schema';
import { generateAccountNumber, generateRoutingNumber } from '../../common/utils/generate-ref.util';

@Injectable()
export class AccountsService {
  constructor(
    @InjectModel(Account.name)
    private readonly accountModel: Model<AccountDocument>,

    @InjectModel(Transaction.name)
    private readonly txModel: Model<TransactionDocument>,
  ) {}

  // ── Create Account ────────────────────────────────────────────
  async createAccount(userId: string, accountType: AccountType = AccountType.CHECKING) {
    const count = await this.accountModel.countDocuments({
      userId: new Types.ObjectId(userId),
    });

    if (count >= 5) throw new BadRequestException('Maximum 5 accounts allowed per user');

    const account = await this.accountModel.create({
      userId:        new Types.ObjectId(userId),
      accountNumber: generateAccountNumber(),
      routingNumber: generateRoutingNumber(),
      accountType,
      isPrimary:     count === 0,
    });

    return account;
  }

  // ── Get All User Accounts ─────────────────────────────────────
  async getUserAccounts(userId: string) {
    return this.accountModel
      .find({ userId: new Types.ObjectId(userId) })
      .lean();
  }

  // ── Get Account By ID ─────────────────────────────────────────
  async getAccountById(accountId: string, userId: string) {
    const account = await this.accountModel
      .findOne({
        _id:    new Types.ObjectId(accountId),
        userId: new Types.ObjectId(userId),
      })
      .lean();

    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  // ── Dashboard — balances + income/debit % ─────────────────────
  async getDashboard(userId: string) {
    const accounts     = await this.getUserAccounts(userId);
    const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

    // Month-to-date aggregation
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [agg] = await this.txModel.aggregate([
      {
        $match: {
          userId:    new Types.ObjectId(userId),
          status:    'completed',
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id:         null,
          totalCredit: {
            $sum: { $cond: [{ $eq: ['$direction', 'credit'] }, '$amount', 0] },
          },
          totalDebit: {
            $sum: { $cond: [{ $eq: ['$direction', 'debit'] }, '$amount', 0] },
          },
        },
      },
    ]);

    const credit = agg?.totalCredit ?? 0;
    const debit  = agg?.totalDebit  ?? 0;
    const grand  = credit + debit || 1; // avoid division by zero

    return {
      accounts,
      totalBalance,
      analytics: {
        monthlyIncome:   credit,
        monthlyExpenses: debit,
        incomePercent:   +((credit / grand) * 100).toFixed(1),
        debitPercent:    +((debit  / grand) * 100).toFixed(1),
      },
    };
  }

  // ── Freeze / Unfreeze ─────────────────────────────────────────
  async toggleFreeze(accountId: string, userId: string) {
    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.status === AccountStatus.CLOSED)
      throw new BadRequestException('Cannot modify a closed account');

    const newStatus =
      account.status === AccountStatus.FROZEN
        ? AccountStatus.ACTIVE
        : AccountStatus.FROZEN;

    await this.accountModel.findByIdAndUpdate(accountId, { status: newStatus });
    return {
      message: `Account ${newStatus === AccountStatus.FROZEN ? 'frozen' : 'unfrozen'} successfully`,
      status:  newStatus,
    };
  }

  // ── Update Nickname ───────────────────────────────────────────
  async updateNickname(accountId: string, userId: string, nickname: string) {
    const account = await this.accountModel.findOneAndUpdate(
      { _id: new Types.ObjectId(accountId), userId: new Types.ObjectId(userId) },
      { nickname },
      { new: true },
    );
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  // ── Close Account ─────────────────────────────────────────────
  async closeAccount(accountId: string, userId: string) {
    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.balance > 0)
      throw new BadRequestException(
        `Please withdraw your remaining balance of $${account.balance} before closing`,
      );
    if (account.isPrimary)
      throw new BadRequestException('Cannot close your primary account');

    await this.accountModel.findByIdAndUpdate(accountId, {
      status:  AccountStatus.CLOSED,
      balance: 0,
      availableBalance: 0,
    });

    return { message: 'Account closed successfully' };
  }
}
import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException,
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

    @InjectModel('User') private readonly userModel: Model<any>,
  ) {}

  // ── Create Account ────────────────────────────────────────────
  async createAccount(userId: string, accountType: AccountType = AccountType.CHECKING) {
    const user  = await this.userModel.findById(userId);
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
      currency:      user?.preferredCurrency || 'USD',
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
    const grand  = credit + debit || 1;

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

  // ── Freeze / Unfreeze (USER-INITIATED) ───────────────────────
  // ⚠️ KEY RULE: If an account was frozen by admin (adminFrozen flag),
  // the user CANNOT unfreeze it — they must contact support.
  // Users can only freeze/unfreeze accounts they froze themselves.
  async toggleFreeze(accountId: string, userId: string) {
    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.status === AccountStatus.CLOSED)
      throw new BadRequestException('Cannot modify a closed account');

    // Block user from unfreezing admin-frozen accounts
    if (account.status === AccountStatus.FROZEN && account.adminFrozen) {
      throw new ForbiddenException(
        'This account has been frozen by our compliance team. ' +
        'Please contact support@nexabank.com to resolve this.',
      );
    }

    const newStatus =
      account.status === AccountStatus.FROZEN
        ? AccountStatus.ACTIVE
        : AccountStatus.FROZEN;

    // User action — never touches adminFrozen flag (admin controls that exclusively)
    await this.accountModel.findByIdAndUpdate(accountId, {
      status: newStatus,
    });

    return {
      message: `Account ${newStatus === AccountStatus.FROZEN ? 'frozen' : 'unfrozen'} successfully`,
      status:  newStatus,
    };
  }

  // ── Lookup by account number (for intrabank transfer UI) ──────
  async lookupByAccountNumber(accountNumber: string) {
    const account = await this.accountModel
      .findOne({ accountNumber })
      .populate('userId', 'firstName lastName username');
    if (!account) throw new NotFoundException('Account not found');
    const user = account.userId as any;
    return {
      firstName:   user.firstName,
      lastName:    user.lastName,
      username:    user.username,
      accountType: account.accountType,
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

    // Block close if admin-frozen
    if (account.adminFrozen) {
      throw new ForbiddenException(
        'This account has been frozen by our compliance team and cannot be closed. ' +
        'Please contact support@nexabank.com.',
      );
    }

    if (account.balance > 0)
      throw new BadRequestException(
        `Please withdraw your remaining balance of $${account.balance} before closing`,
      );
    if (account.isPrimary)
      throw new BadRequestException('Cannot close your primary account');

    await this.accountModel.findByIdAndUpdate(accountId, {
      status:           AccountStatus.CLOSED,
      balance:          0,
      availableBalance: 0,
    });

    return { message: 'Account closed successfully' };
  }
}
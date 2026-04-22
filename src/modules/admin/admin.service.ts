import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';

import { User, UserDocument, UserStatus, UserRole, CreditRating } from '../users/schemas/user.schema';
import { Account, AccountDocument, AccountStatus, AccountType } from '../accounts/schemas/account.schema';
import { Transaction, TransactionDocument, TransactionType, TransactionStatus, TransactionDirection } from '../transactions/schemas/transaction.schema';
import { Loan, LoanDocument, LoanStatus } from '../loans/schemas/loan.schema';
import { Kyc, KycDocument } from '../kyc/schemas/kyc.schema';
import { ChequeDeposit, ChequeDepositDocument, ChequeStatus } from '../cheque-deposit/schemas/cheque-deposit.schema';
import { Investment, InvestmentDocument, OrderStatus } from '../investments/schemas/investment.schema';
import { AdminLog, AdminLogDocument } from './schemas/admin-log.schema';
import { CryptoAddress, CryptoAddressDocument } from './schemas/crypto-address.schema';
import { OtpConfig, OtpConfigDocument } from './schemas/otp-config.schema';

import { NotificationsService } from '../notifications/notifications.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { generateAccountNumber, generateRoutingNumber, generateReference } from '../../common/utils/generate-ref.util';

import {
  CreateUserAdminDto, CreateAccountAdminDto, CreditDebitUserDto,
  UpdateTransferDto, BlockTransferDto, ApproveLoanDto, DeclineLoanDto,
  ReviewKycDto, ReviewChequeDto, ReviewInvestmentDto,
  UpsertCryptoAddressDto, EditReceiptDto, UpdateOtpConfigDto, AdminQueryDto,
} from './dto/admin.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name)         private userModel:         Model<UserDocument>,
    @InjectModel(Account.name)      private accountModel:      Model<AccountDocument>,
    @InjectModel(Transaction.name)  private txModel:           Model<TransactionDocument>,
    @InjectModel(Loan.name)         private loanModel:         Model<LoanDocument>,
    @InjectModel(Kyc.name)          private kycModel:          Model<KycDocument>,
    @InjectModel(ChequeDeposit.name) private chequeModel:      Model<ChequeDepositDocument>,
    @InjectModel(Investment.name)   private investmentModel:   Model<InvestmentDocument>,
    @InjectModel(AdminLog.name)     private adminLogModel:     Model<AdminLogDocument>,
    @InjectModel(CryptoAddress.name) private cryptoAddrModel:  Model<CryptoAddressDocument>,
    @InjectModel(OtpConfig.name)    private otpConfigModel:    Model<OtpConfigDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly receiptsService:      ReceiptsService,
    private readonly config:               ConfigService,
  ) {}

  // ══════════════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════════════

  async getDashboardStats() {
    const [
      totalUsers, activeUsers, pendingUsers, suspendedUsers,
      totalAccounts, frozenAccounts,
      totalTransactions, pendingTx, completedTx, failedTx,
      totalLoans, pendingLoans, activeLoans,
      pendingKyc, approvedKyc, rejectedKyc,
      pendingCheques,
      totalDeposited, totalWithdrawn,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ status: 'active' }),
      this.userModel.countDocuments({ status: 'pending' }),
      this.userModel.countDocuments({ status: 'suspended' }),
      this.accountModel.countDocuments(),
      this.accountModel.countDocuments({ status: 'frozen' }),
      this.txModel.countDocuments(),
      this.txModel.countDocuments({ status: 'pending' }),
      this.txModel.countDocuments({ status: 'completed' }),
      this.txModel.countDocuments({ status: 'failed' }),
      this.loanModel.countDocuments(),
      this.loanModel.countDocuments({ status: 'under_review' }),
      this.loanModel.countDocuments({ status: 'active' }),
      this.kycModel.countDocuments({ status: 'pending' }),
      this.kycModel.countDocuments({ status: 'approved' }),
      this.kycModel.countDocuments({ status: 'rejected' }),
      this.chequeModel.countDocuments({ status: 'submitted' }),
      this.accountModel.aggregate([{ $group: { _id: null, total: { $sum: '$totalDeposited' } } }]),
      this.accountModel.aggregate([{ $group: { _id: null, total: { $sum: '$totalWithdrawn' } } }]),
    ]);

    const recentTransactions = await this.txModel
      .find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'username email firstName lastName')
      .lean();

    const recentUsers = await this.userModel
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('-passwordHash -refreshTokenHash -twoFactorSecret -securityPinHash')
      .lean();

    return {
      users:        { total: totalUsers, active: activeUsers, pending: pendingUsers, suspended: suspendedUsers },
      accounts:     { total: totalAccounts, frozen: frozenAccounts },
      transactions: { total: totalTransactions, pending: pendingTx, completed: completedTx, failed: failedTx },
      loans:        { total: totalLoans, pending: pendingLoans, active: activeLoans },
      kyc:          { pending: pendingKyc, approved: approvedKyc, rejected: rejectedKyc },
      cheques:      { pending: pendingCheques },
      finance: {
        totalDeposited: totalDeposited[0]?.total ?? 0,
        totalWithdrawn: totalWithdrawn[0]?.total ?? 0,
      },
      recentTransactions,
      recentUsers,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // USER MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async getAllUsers(query: AdminQueryDto) {
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.search) {
      filter.$or = [
        { username:  { $regex: query.search, $options: 'i' } },
        { email:     { $regex: query.search, $options: 'i' } },
        { firstName: { $regex: query.search, $options: 'i' } },
        { lastName:  { $regex: query.search, $options: 'i' } },
      ];
    }

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;
    const skip  = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.userModel.find(filter)
        .select('-passwordHash -refreshTokenHash -twoFactorSecret -securityPinHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return { users, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getUserDetails(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-passwordHash -refreshTokenHash -twoFactorSecret -securityPinHash')
      .lean();
    if (!user) throw new NotFoundException('User not found');

    const [accounts, transactions, loans, kyc] = await Promise.all([
      this.accountModel.find({ userId: new Types.ObjectId(userId) }).lean(),
      this.txModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(20).lean(),
      this.loanModel.find({ userId: new Types.ObjectId(userId) }).lean(),
      this.kycModel.findOne({ userId: new Types.ObjectId(userId) }).lean(),
    ]);

    return { user, accounts, transactions, loans, kyc };
  }

  async createUser(dto: CreateUserAdminDto, admin: UserDocument) {
    const exists = await this.userModel.findOne({
      $or: [{ email: dto.email }, { username: dto.username }],
    });
    if (exists) throw new BadRequestException('Email or username already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.userModel.create({
      ...dto,
      passwordHash,
      status:        dto.skipEmailVerification ? UserStatus.ACTIVE : UserStatus.PENDING,
      emailVerified: dto.skipEmailVerification ?? false,
      role:          dto.role ?? UserRole.USER,
    });

    await this.log(admin, 'CREATE_USER', 'user', user._id as Types.ObjectId, {}, { username: dto.username, email: dto.email });
    return user;
  }

  async blockUser(userId: string, reason: string, admin: UserDocument) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN)
      throw new ForbiddenException('Cannot block an admin user');

    const before = { status: user.status };
    await this.userModel.findByIdAndUpdate(userId, { status: UserStatus.SUSPENDED });
    await this.log(admin, 'BLOCK_USER', 'user', user._id as Types.ObjectId, before, { status: 'suspended', reason });

    await this.notificationsService.sendOtpEmail(user.email, '', 'email_verification').catch(() => null);
    return { message: `User ${user.username} has been blocked` };
  }

  async unblockUser(userId: string, admin: UserDocument) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const before = { status: user.status };
    await this.userModel.findByIdAndUpdate(userId, {
      status:             UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      lockedUntil:        null,
    });
    await this.log(admin, 'UNBLOCK_USER', 'user', user._id as Types.ObjectId, before, { status: 'active' });
    return { message: `User ${user.username} has been unblocked` };
  }

  async updateUserCreditScore(userId: string, score: number, rating: CreditRating, admin: UserDocument) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const before = { creditScore: user.creditScore, creditRating: user.creditRating };
    await this.userModel.findByIdAndUpdate(userId, { creditScore: score, creditRating: rating });
    await this.log(admin, 'UPDATE_CREDIT_SCORE', 'user', user._id as Types.ObjectId, before, { creditScore: score, creditRating: rating });
    return { message: 'Credit score updated', creditScore: score, creditRating: rating };
  }

  // ══════════════════════════════════════════════════════════════
  // ACCOUNT MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async createAccountForUser(dto: CreateAccountAdminDto, admin: UserDocument) {
    const user = await this.userModel.findById(dto.userId);
    if (!user) throw new NotFoundException('User not found');

    const count = await this.accountModel.countDocuments({ userId: new Types.ObjectId(dto.userId) });
    const account = await this.accountModel.create({
      userId:        new Types.ObjectId(dto.userId),
      accountNumber: generateAccountNumber(),
      routingNumber: generateRoutingNumber(),
      accountType:   dto.accountType,
      isPrimary:     count === 0,
      nickname:      dto.nickname,
      balance:          dto.initialDeposit ?? 0,
      availableBalance: dto.initialDeposit ?? 0,
      totalDeposited:   dto.initialDeposit ?? 0,
    });

    await this.log(admin, 'CREATE_ACCOUNT', 'account', account._id as Types.ObjectId, {}, { userId: dto.userId, type: dto.accountType });
    return account;
  }

  async getAllAccounts(query: AdminQueryDto) {
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.search) filter.accountNumber = { $regex: query.search, $options: 'i' };

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;

    const [accounts, total] = await Promise.all([
      this.accountModel.find(filter)
        .populate('userId', 'username email firstName lastName')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.accountModel.countDocuments(filter),
    ]);

    return { accounts, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async freezeAccount(accountId: string, admin: UserDocument) {
    const account = await this.accountModel.findById(accountId);
    if (!account) throw new NotFoundException('Account not found');

    const before = { status: account.status };
    await this.accountModel.findByIdAndUpdate(accountId, { status: AccountStatus.FROZEN });
    await this.log(admin, 'FREEZE_ACCOUNT', 'account', account._id as Types.ObjectId, before, { status: 'frozen' });
    return { message: 'Account frozen successfully' };
  }

  async unfreezeAccount(accountId: string, admin: UserDocument) {
    const account = await this.accountModel.findById(accountId);
    if (!account) throw new NotFoundException('Account not found');

    const before = { status: account.status };
    await this.accountModel.findByIdAndUpdate(accountId, { status: AccountStatus.ACTIVE });
    await this.log(admin, 'UNFREEZE_ACCOUNT', 'account', account._id as Types.ObjectId, before, { status: 'active' });
    return { message: 'Account unfrozen successfully' };
  }

  async creditDebitUser(dto: CreditDebitUserDto, admin: UserDocument) {
    const account = await this.accountModel.findById(dto.accountId);
    if (!account) throw new NotFoundException('Account not found');
    if (account.status === AccountStatus.FROZEN)
      throw new BadRequestException('Account is frozen');

    const before = { balance: account.balance, availableBalance: account.availableBalance };

    if (dto.type === 'credit') {
      account.balance          += dto.amount;
      account.availableBalance += dto.amount;
      account.totalDeposited   += dto.amount;
    } else {
      if (account.availableBalance < dto.amount)
        throw new BadRequestException('Insufficient account balance');
      account.balance          -= dto.amount;
      account.availableBalance -= dto.amount;
      account.totalWithdrawn   += dto.amount;
    }

    await account.save();

    const ref = generateReference('ADM');
    await this.txModel.create({
      userId:      account.userId,
      accountId:   account._id,
      referenceNumber: ref,
      type:        dto.type === 'credit' ? TransactionType.DEPOSIT : TransactionType.WITHDRAWAL,
      status:      TransactionStatus.COMPLETED,
      direction:   dto.type === 'credit' ? TransactionDirection.CREDIT : TransactionDirection.DEBIT,
      amount:      dto.amount,
      fee:         0,
      currency:    'USD',
      description: `Admin ${dto.type}: ${dto.reason}`,
      balanceAfter: account.balance,
      processedAt: new Date(),
      metadata:    { adminAction: true, adminId: admin._id, reason: dto.reason },
    });

    await this.log(admin, `ADMIN_${dto.type.toUpperCase()}`, 'account', account._id as Types.ObjectId, before, {
      balance: account.balance, amount: dto.amount, reason: dto.reason,
    });

    return {
      success:    true,
      type:       dto.type,
      amount:     dto.amount,
      newBalance: account.balance,
      reference:  ref,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // TRANSFER / TRANSACTION MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async getAllTransactions(query: AdminQueryDto) {
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.search) {
      filter.$or = [
        { referenceNumber: { $regex: query.search, $options: 'i' } },
        { recipientName:   { $regex: query.search, $options: 'i' } },
      ];
    }
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to)   filter.createdAt.$lte = new Date(query.to);
    }

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;

    const [transactions, total] = await Promise.all([
      this.txModel.find(filter)
        .populate('userId', 'username email firstName lastName')
        .populate('accountId', 'accountNumber accountType')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.txModel.countDocuments(filter),
    ]);

    return { transactions, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async updateTransaction(txId: string, dto: UpdateTransferDto, admin: UserDocument) {
    const tx = await this.txModel.findById(txId);
    if (!tx) throw new NotFoundException('Transaction not found');

    const before = tx.toObject();
    const updateData: any = {};

    if (dto.status)                 updateData.status                  = dto.status;
    if (dto.amount)                 updateData.amount                  = dto.amount;
    if (dto.description)            updateData.description             = dto.description;
    if (dto.recipientName)          updateData.recipientName           = dto.recipientName;
    if (dto.recipientAccountNumber) updateData.recipientAccountNumber  = dto.recipientAccountNumber;
    if (dto.recipientBankName)      updateData.recipientBankName       = dto.recipientBankName;
    if (dto.swiftCode)              updateData.swiftCode               = dto.swiftCode;
    if (dto.ibanNumber)             updateData.ibanNumber              = dto.ibanNumber;
    if (dto.processedAt)            updateData.processedAt             = new Date(dto.processedAt);
    if (dto.adminNotes)             updateData['metadata.adminNotes']  = dto.adminNotes;

    const updated = await this.txModel.findByIdAndUpdate(txId, updateData, { new: true });
    await this.log(admin, 'UPDATE_TRANSACTION', 'transaction', tx._id as Types.ObjectId, before, updateData);

    // Regenerate receipt if status changed to completed
    if (dto.status === 'completed' && updated) {
      const receiptUrl = await this.receiptsService.generatePdfReceipt(updated).catch(() => '');
      if (receiptUrl) await this.txModel.findByIdAndUpdate(txId, { receiptUrl });
    }

    return updated;
  }

  async blockTransaction(dto: BlockTransferDto, admin: UserDocument) {
    const tx = await this.txModel.findById(dto.transactionId);
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.status === TransactionStatus.COMPLETED)
      throw new BadRequestException('Cannot block a completed transaction');

    const before = { status: tx.status };
    await this.txModel.findByIdAndUpdate(dto.transactionId, {
      status: TransactionStatus.CANCELLED,
      'metadata.blockedReason': dto.reason,
      'metadata.blockedAt':     new Date(),
      'metadata.blockedBy':     admin._id,
    });

    await this.log(admin, 'BLOCK_TRANSACTION', 'transaction', tx._id as Types.ObjectId, before, { status: 'cancelled', reason: dto.reason });
    return { message: 'Transaction blocked successfully' };
  }

  async unblockTransaction(txId: string, admin: UserDocument) {
    const tx = await this.txModel.findById(txId);
    if (!tx) throw new NotFoundException('Transaction not found');

    const before = { status: tx.status };
    await this.txModel.findByIdAndUpdate(txId, {
      status: TransactionStatus.PENDING,
      $unset: { 'metadata.blockedReason': '', 'metadata.blockedAt': '', 'metadata.blockedBy': '' },
    });

    await this.log(admin, 'UNBLOCK_TRANSACTION', 'transaction', tx._id as Types.ObjectId, before, { status: 'pending' });
    return { message: 'Transaction unblocked and set back to pending' };
  }

  async editReceipt(txId: string, dto: EditReceiptDto, admin: UserDocument) {
    const tx = await this.txModel.findById(txId);
    if (!tx) throw new NotFoundException('Transaction not found');

    const before  = tx.toObject();
    const updated = await this.txModel.findByIdAndUpdate(txId, dto, { new: true });

    // Regenerate the PDF receipt with new data
    const receiptUrl = await this.receiptsService.generatePdfReceipt(updated).catch(() => tx.receiptUrl);
    await this.txModel.findByIdAndUpdate(txId, { receiptUrl });

    await this.log(admin, 'EDIT_RECEIPT', 'transaction', tx._id as Types.ObjectId, before, dto);
    return { message: 'Receipt updated', receiptUrl };
  }

  // ══════════════════════════════════════════════════════════════
  // LOAN MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async getAllLoans(query: AdminQueryDto) {
    const filter: any = {};
    if (query.status) filter.status = query.status;

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;

    const [loans, total] = await Promise.all([
      this.loanModel.find(filter)
        .populate('userId', 'username email firstName lastName creditScore')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.loanModel.countDocuments(filter),
    ]);

    return { loans, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async approveLoan(loanId: string, dto: ApproveLoanDto, admin: UserDocument) {
    const loan = await this.loanModel.findById(loanId).populate('userId');
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== LoanStatus.UNDER_REVIEW)
      throw new BadRequestException('Loan is not under review');

    const monthlyRate    = dto.interestRate / 100 / 12;
    const monthlyPayment = +(
      loan.termMonths === 0 ? dto.approvedAmount / 12 :
      (dto.approvedAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -loan.termMonths))
    ).toFixed(2);

    // Build repayment schedule
    const repaymentSchedule = [];
    let balance = dto.approvedAmount;
    for (let i = 1; i <= loan.termMonths; i++) {
      const interest  = +(balance * monthlyRate).toFixed(2);
      const principal = +(monthlyPayment - interest).toFixed(2);
      balance         = +(balance - principal).toFixed(2);
      const dueDate   = new Date();
      dueDate.setMonth(dueDate.getMonth() + i);
      repaymentSchedule.push({ dueDate, amount: monthlyPayment, principal, interest, status: 'pending' });
    }

    const before = { status: loan.status };
    await this.loanModel.findByIdAndUpdate(loanId, {
      status:             LoanStatus.APPROVED,
      approvedAmount:     dto.approvedAmount,
      outstandingBalance: dto.approvedAmount,
      interestRate:       dto.interestRate,
      monthlyPayment,
      approvedAt:         new Date(),
      reviewedBy:         String(admin._id),
      repaymentSchedule,
    });

    const user = loan.userId as any;
    if (user?.email) {
      await this.notificationsService.sendLoanStatusEmail(
        user.email, user.firstName, 'approved', dto.approvedAmount,
      ).catch(() => null);
    }

    await this.log(admin, 'APPROVE_LOAN', 'loan', loan._id as Types.ObjectId, before, { status: 'approved', approvedAmount: dto.approvedAmount });
    return { message: 'Loan approved successfully', monthlyPayment, repaymentSchedule };
  }

  async declineLoan(loanId: string, dto: DeclineLoanDto, admin: UserDocument) {
    const loan = await this.loanModel.findById(loanId).populate('userId');
    if (!loan) throw new NotFoundException('Loan not found');
    if (![LoanStatus.PENDING, LoanStatus.UNDER_REVIEW].includes(loan.status))
      throw new BadRequestException('Loan cannot be declined in its current state');

    const before = { status: loan.status };
    await this.loanModel.findByIdAndUpdate(loanId, {
      status:          LoanStatus.REJECTED,
      rejectionReason: dto.reason,
      reviewedBy:      String(admin._id),
    });

    const user = loan.userId as any;
    if (user?.email) {
      await this.notificationsService.sendLoanStatusEmail(
        user.email, user.firstName, 'rejected', loan.requestedAmount,
      ).catch(() => null);
    }

    await this.log(admin, 'DECLINE_LOAN', 'loan', loan._id as Types.ObjectId, before, { status: 'rejected', reason: dto.reason });
    return { message: 'Loan declined' };
  }

  async disburseLoan(loanId: string, admin: UserDocument) {
    const loan = await this.loanModel.findById(loanId).populate('userId');
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== LoanStatus.APPROVED)
      throw new BadRequestException('Loan must be approved before disbursement');

    // Credit to user primary account
    const account = await this.accountModel.findOne({
      userId:    loan.userId,
      isPrimary: true,
    });
    if (!account) throw new NotFoundException('User primary account not found');

    account.balance          += loan.approvedAmount;
    account.availableBalance += loan.approvedAmount;
    account.totalDeposited   += loan.approvedAmount;
    await account.save();

    const ref = generateReference('LOAN');
    await this.txModel.create({
      userId:      loan.userId,
      accountId:   account._id,
      referenceNumber: ref,
      type:        TransactionType.LOAN_DISBURSEMENT,
      status:      TransactionStatus.COMPLETED,
      direction:   TransactionDirection.CREDIT,
      amount:      loan.approvedAmount,
      fee:         0,
      currency:    'USD',
      description: `Loan disbursement — ${loan.loanType}`,
      balanceAfter: account.balance,
      processedAt: new Date(),
    });

    await this.loanModel.findByIdAndUpdate(loanId, {
      status:          LoanStatus.ACTIVE,
      disbursedAmount: loan.approvedAmount,
      disbursedAt:     new Date(),
      nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await this.log(admin, 'DISBURSE_LOAN', 'loan', loan._id as Types.ObjectId, {}, { amount: loan.approvedAmount, ref });
    return { success: true, message: 'Loan disbursed', amount: loan.approvedAmount, reference: ref };
  }

  // ══════════════════════════════════════════════════════════════
  // KYC MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async getAllKyc(query: AdminQueryDto) {
    const filter: any = {};
    if (query.status) filter.status = query.status;

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;

    const [kycs, total] = await Promise.all([
      this.kycModel.find(filter)
        .populate('userId', 'username email firstName lastName phoneNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.kycModel.countDocuments(filter),
    ]);

    return { kycs, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async reviewKyc(kycId: string, dto: ReviewKycDto, admin: UserDocument) {
    const kyc = await this.kycModel.findById(kycId).populate('userId');
    if (!kyc) throw new NotFoundException('KYC record not found');

    const before  = { status: kyc.status };
    const isApproved = dto.decision === 'approved';

    await this.kycModel.findByIdAndUpdate(kycId, {
      status:          dto.decision,
      reviewedAt:      new Date(),
      reviewedBy:      String(admin._id),
      rejectionNote:   dto.notes,
      identityVerified: isApproved,
      documentVerified: isApproved,
      addressVerified:  isApproved,
    });

    await this.userModel.findByIdAndUpdate(kyc.userId, { kycStatus: dto.decision });

    const user = kyc.userId as any;
    if (user?.email) {
      await this.notificationsService.sendOtpEmail(
        user.email,
        '',
        'email_verification',
      ).catch(() => null);
    }

    await this.log(admin, `KYC_${dto.decision.toUpperCase()}`, 'kyc', kyc._id as Types.ObjectId, before, { decision: dto.decision, notes: dto.notes });
    return { message: `KYC ${dto.decision} successfully` };
  }

  // ══════════════════════════════════════════════════════════════
  // CHEQUE MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async getAllCheques(query: AdminQueryDto) {
    const filter: any = {};
    if (query.status) filter.status = query.status;

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;

    const [cheques, total] = await Promise.all([
      this.chequeModel.find(filter)
        .populate('userId', 'username email firstName lastName')
        .populate('accountId', 'accountNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.chequeModel.countDocuments(filter),
    ]);

    return { cheques, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async reviewCheque(chequeId: string, dto: ReviewChequeDto, admin: UserDocument) {
    const cheque = await this.chequeModel.findById(chequeId);
    if (!cheque) throw new NotFoundException('Cheque not found');
    if (cheque.status !== ChequeStatus.SUBMITTED && cheque.status !== ChequeStatus.REVIEWING)
      throw new BadRequestException('Cheque is not pending review');

    const before = { status: cheque.status };

    if (dto.decision === 'approved') {
      // Credit account
      const account = await this.accountModel.findById(cheque.accountId);
      if (account) {
        account.balance          += cheque.amount;
        account.availableBalance += cheque.amount;
        account.pendingBalance   -= cheque.amount;
        account.totalDeposited   += cheque.amount;
        await account.save();

        // Update pending tx to completed
        await this.txModel.findOneAndUpdate(
          { referenceNumber: cheque.referenceNumber },
          { status: TransactionStatus.COMPLETED, processedAt: new Date(), balanceAfter: account.balance },
        );
      }

      await this.chequeModel.findByIdAndUpdate(chequeId, {
        status:     ChequeStatus.CLEARED,
        clearedAt:  new Date(),
        reviewedAt: new Date(),
      });
    } else {
      // Return pending balance
      const account = await this.accountModel.findById(cheque.accountId);
      if (account) {
        account.pendingBalance -= cheque.amount;
        await account.save();
      }

      await this.txModel.findOneAndUpdate(
        { referenceNumber: cheque.referenceNumber },
        { status: TransactionStatus.FAILED },
      );

      await this.chequeModel.findByIdAndUpdate(chequeId, {
        status:          ChequeStatus.REJECTED,
        rejectionReason: dto.reason,
        reviewedAt:      new Date(),
      });
    }

    await this.log(admin, `CHEQUE_${dto.decision.toUpperCase()}`, 'cheque', cheque._id as Types.ObjectId, before, dto);
    return { message: `Cheque ${dto.decision}` };
  }

  // ══════════════════════════════════════════════════════════════
  // INVESTMENT MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async getAllInvestments(query: AdminQueryDto) {
    const filter: any = {};
    if (query.status) filter.orderStatus = query.status;

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;

    const [investments, total] = await Promise.all([
      this.investmentModel.find(filter)
        .populate('userId', 'username email firstName lastName')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.investmentModel.countDocuments(filter),
    ]);

    return { investments, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async reviewInvestment(investmentId: string, dto: ReviewInvestmentDto, admin: UserDocument) {
    const investment = await this.investmentModel.findById(investmentId);
    if (!investment) throw new NotFoundException('Investment not found');

    const before = { orderStatus: investment.orderStatus };
    const newStatus = dto.decision === 'approved' ? OrderStatus.FILLED : OrderStatus.CANCELLED;

    await this.investmentModel.findByIdAndUpdate(investmentId, {
      orderStatus: newStatus,
      filledAt:    dto.decision === 'approved' ? new Date() : undefined,
    });

    if (dto.decision === 'rejected') {
      // Refund to account
      const account = await this.accountModel.findById(investment.accountId);
      if (account) {
        account.balance          += investment.totalInvested;
        account.availableBalance += investment.totalInvested;
        await account.save();
      }
    }

    await this.log(admin, `INVESTMENT_${dto.decision.toUpperCase()}`, 'investment', investment._id as Types.ObjectId, before, dto);
    return { message: `Investment ${dto.decision}` };
  }

  // ══════════════════════════════════════════════════════════════
  // CRYPTO ADDRESS MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async getAllCryptoAddresses() {
    return this.cryptoAddrModel.find().sort({ network: 1 }).lean();
  }

  async upsertCryptoAddress(dto: UpsertCryptoAddressDto, admin: UserDocument) {
    const existing = await this.cryptoAddrModel.findOne({ network: dto.network });
    const before   = existing?.toObject() ?? {};

    const address = await this.cryptoAddrModel.findOneAndUpdate(
      { network: dto.network },
      { ...dto },
      { upsert: true, new: true },
    );

    await this.log(admin, 'UPSERT_CRYPTO_ADDRESS', 'crypto_address', address._id as Types.ObjectId, before, dto);
    return address;
  }

  async deleteCryptoAddress(network: string, admin: UserDocument) {
    const address = await this.cryptoAddrModel.findOneAndDelete({ network });
    if (!address) throw new NotFoundException('Crypto address not found');
    await this.log(admin, 'DELETE_CRYPTO_ADDRESS', 'crypto_address', address._id as Types.ObjectId, address.toObject(), {});
    return { message: `${network} address deleted` };
  }

  // ══════════════════════════════════════════════════════════════
  // OTP MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async getAllOtpConfigs() {
    const configs = await this.otpConfigModel.find().lean();
    // Return defaults for any purpose not yet configured
    const defaultPurposes = [
      'email_verification', 'transfer_confirmation', 'login_verification',
      'password_reset', 'security_pin_change', 'bill_payment',
      'crypto_payment', 'loan_repayment',
    ];

    const result = defaultPurposes.map((p) => {
      const found = configs.find((c) => c.purpose === p);
      return found ?? { purpose: p, isEnabled: true, expiryMinutes: 10, maxAttempts: 3 };
    });

    return result;
  }

  async updateOtpConfig(dto: UpdateOtpConfigDto, admin: UserDocument) {
    const config = await this.otpConfigModel.findOneAndUpdate(
      { purpose: dto.purpose },
      {
        isEnabled:     dto.isEnabled,
        expiryMinutes: dto.expiryMinutes ?? 10,
        maxAttempts:   dto.maxAttempts ?? 3,
        pausedReason:  dto.isEnabled ? null : (dto.pausedReason ?? 'Paused by admin'),
        pausedAt:      dto.isEnabled ? null : new Date(),
        pausedBy:      dto.isEnabled ? null : String(admin._id),
      },
      { upsert: true, new: true },
    );

    await this.log(admin, dto.isEnabled ? 'UNPAUSE_OTP' : 'PAUSE_OTP', 'otp_config',
      config._id as Types.ObjectId, {}, dto);

    return {
      message: `OTP for "${dto.purpose}" has been ${dto.isEnabled ? 'enabled' : 'paused'}`,
      config,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // AUDIT LOGS
  // ══════════════════════════════════════════════════════════════

  async getAuditLogs(query: AdminQueryDto) {
    const filter: any = {};
    if (query.search) filter.action = { $regex: query.search, $options: 'i' };
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to)   filter.createdAt.$lte = new Date(query.to);
    }

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 50;

    const [logs, total] = await Promise.all([
      this.adminLogModel.find(filter)
        .populate('adminId', 'username email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.adminLogModel.countDocuments(filter),
    ]);

    return { logs, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ══════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════

  private async log(
    admin:      UserDocument,
    action:     string,
    targetType: string,
    targetId:   Types.ObjectId,
    before:     Record<string, any>,
    after:      Record<string, any>,
  ) {
    await this.adminLogModel.create({
      adminId:       admin._id,
      adminUsername: admin.username,
      action,
      targetType,
      targetId,
      before,
      after,
    }).catch(() => null); // never let logging break the request
  }
}
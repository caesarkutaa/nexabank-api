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
import { CryptoInvestment, CryptoInvestmentDocument } from '../crypto/schemas/crypto-investment.schema';


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
    @InjectModel(CryptoInvestment.name) private cryptoInvestModel: Model<CryptoInvestmentDocument>,
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
 
  // Exclude admin accounts by default; allow explicit role filter
  if (query.role) {
    filter.role = query.role;
  } else {
    filter.role = { $nin: ['admin', 'super_admin'] };
  }
 
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
    this.userModel
      .find(filter)
      .select('-passwordHash -refreshTokenHash -twoFactorSecret -securityPinHash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.userModel.countDocuments(filter),
  ]);
 
  if (!users.length) {
    return { users, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }
 
  // ── Merge LIVE kycStatus from the KYC collection ──────────────────────────
  // One bulk query — find all KYC docs for the returned user IDs
  const userIds = users.map(u => u._id);
  const kycDocs = await this.kycModel
    .find({ userId: { $in: userIds } })
    .select('userId status')
    .lean();
 
  // Build a map: userId (string) → live kycStatus
  const kycMap = new Map<string, string>();
  for (const doc of kycDocs) {
    kycMap.set(String(doc.userId), doc.status);
  }
 
  // Overwrite kycStatus on each user with the live value
  const enrichedUsers = users.map(u => ({
    ...u,
    kycStatus: kycMap.get(String(u._id)) ?? u.kycStatus ?? 'not_started',
  }));
 
  return {
    users: enrichedUsers,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
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
    // If skipKyc: set kycStatus to approved on the user document
    kycStatus:     (dto as any).skipKyc ? 'approved' : 'not_started',
    hasPinSet:     false,
  });
 
  // If skipKyc: also create a KYC document marked as approved
  // so the KYC page and admin KYC list show it correctly
  if ((dto as any).skipKyc) {
    await this.kycModel.create({
      userId:     user._id,
      status:     'approved',
      reviewedAt: new Date(),
      reviewedBy: String(admin._id),
      documentType:   'admin_verified',
      documentNumber: 'ADMIN-BYPASS',
    }).catch(() => null); // don't fail if KYC model isn't available here
  }
 
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

  async deleteAccount(accountId: string, admin: UserDocument) {
  const account = await this.accountModel.findById(accountId);
  if (!account) throw new NotFoundException('Account not found');
 
  // Log the balance at time of deletion for audit trail
  const balanceAtDeletion = account.balance;
 
  await Promise.all([
    this.accountModel.findByIdAndDelete(accountId),
    this.txModel.deleteMany({ accountId: account._id }),
  ]);
 
  await this.log(
    admin,
    'DELETE_ACCOUNT',
    'account',
    account._id as Types.ObjectId,
    { ...account.toObject(), balanceAtDeletion },
    { deleted: true, balanceForfeited: balanceAtDeletion },
  );
 
  return {
    message: 'Account deleted successfully',
    ...(balanceAtDeletion > 0 && { warning: `Account had a balance of $${balanceAtDeletion.toFixed(2)} which has been forfeited` }),
  };
}


  async freezeAccount(accountId: string, admin: UserDocument) {
  const account = await this.accountModel.findById(accountId);
  if (!account) throw new NotFoundException('Account not found');
 
  const before = { status: account.status, adminFrozen: (account as any).adminFrozen };
 
  await this.accountModel.findByIdAndUpdate(accountId, {
    status:      AccountStatus.FROZEN,
    adminFrozen: true,   // ← THE CRITICAL LINE — marks as admin-frozen
  });
 
  await this.log(
    admin, 'FREEZE_ACCOUNT', 'account',
    account._id as Types.ObjectId,
    before,
    { status: 'frozen', adminFrozen: true },
  );
  return { message: 'Account frozen successfully' };
}
 

  async unfreezeAccount(accountId: string, admin: UserDocument) {
  const account = await this.accountModel.findById(accountId);
  if (!account) throw new NotFoundException('Account not found');
 
  const before = { status: account.status, adminFrozen: (account as any).adminFrozen };
 
  await this.accountModel.findByIdAndUpdate(accountId, {
    status:      AccountStatus.ACTIVE,
    adminFrozen: false,  // ← clears flag so user can self-manage again
  });
 
  await this.log(
    admin, 'UNFREEZE_ACCOUNT', 'account',
    account._id as Types.ObjectId,
    before,
    { status: 'active', adminFrozen: false },
  );
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
 
  const ref = generateReference('TXN');
 
  // Build the transaction to look like a real intrabank transfer (credit)
  // or a standard debit — NO mention of admin anywhere in the user-visible fields
  const txPayload: any = {
    userId:          account.userId,
    accountId:       account._id,
    referenceNumber: ref,
    // Use admin-supplied status, default to COMPLETED
    status:      (dto as any).status ?? TransactionStatus.COMPLETED,
    direction:   dto.type === 'credit' ? TransactionDirection.CREDIT : TransactionDirection.DEBIT,
    amount:      dto.amount,
    fee:         0,
    currency:    account.currency || 'USD',
    description: dto.reason,
    balanceAfter: account.balance,
    // Use admin-supplied date/time, default to now
    processedAt: (dto as any).processedAt ? new Date((dto as any).processedAt) : new Date(),
    createdAt:   (dto as any).processedAt ? new Date((dto as any).processedAt) : new Date(),
  };
 
  if (dto.type === 'credit') {
    // Make credit look exactly like an incoming intrabank transfer
    txPayload.type = TransactionType.INTRABANK_TRANSFER;
    // Sender fields — shown to user in their transaction history
    if (dto.senderName)    txPayload.senderName           = dto.senderName;
    if (dto.senderAccount) txPayload.senderAccountNumber  = dto.senderAccount;
    if (dto.senderBank)    txPayload.senderBankName       = dto.senderBank;
    // recipientName is the account holder receiving the funds
    txPayload.recipientAccountNumber = account.accountNumber;
    txPayload.recipientName          = undefined; // recipient is the account owner
  } else {
    // Debit — looks like a regular withdrawal/charge
    txPayload.type = TransactionType.WITHDRAWAL;
  }
 
  // metadata stores admin info for audit — NEVER shown to user
  txPayload.metadata = {
    adminAction: true,
    adminId:     admin._id,
    adminNote:   `Admin ${dto.type}: ${dto.reason}`,
  };
 
  await this.txModel.create(txPayload);
 
  await this.log(
    admin,
    `ADMIN_${dto.type.toUpperCase()}`,
    'account',
    account._id as Types.ObjectId,
    before,
    {
      balance:       account.balance,
      amount:        dto.amount,
      reason:        dto.reason,
      senderName:    dto.senderName,
      senderAccount: dto.senderAccount,
      senderBank:    dto.senderBank,
    },
  );
 
  return {
    success:    true,
    type:       dto.type,
    amount:     dto.amount,
    newBalance: account.balance,
    reference:  ref,
  };
}
 

async adminIntrabankTransfer(
  dto: {
    fromAccountId:   string;
    toAccountNumber: string;
    amount:          number;
    description?:    string;
    recipientName?:  string;
  },
  admin: UserDocument,
) {
  const sender = await this.accountModel.findById(dto.fromAccountId);
  if (!sender) throw new NotFoundException('Source account not found');
  if (sender.status === AccountStatus.FROZEN) throw new BadRequestException('Source account is frozen');
  if (sender.availableBalance < dto.amount) throw new BadRequestException('Insufficient funds');
 
  const recipient = await this.accountModel.findOne({ accountNumber: dto.toAccountNumber });
  if (!recipient) throw new NotFoundException('Recipient account not found');
  if (recipient.accountNumber === sender.accountNumber) throw new BadRequestException('Cannot transfer to the same account');
 
  sender.balance           -= dto.amount; sender.availableBalance -= dto.amount; sender.totalWithdrawn += dto.amount;
  recipient.balance += dto.amount; recipient.availableBalance += dto.amount; recipient.totalDeposited += dto.amount;
  await sender.save(); await recipient.save();
 
  const ref = generateReference('NXB');
 
  // Debit TX — shows in sender's transaction history as a regular transfer (no "admin" in description)
  await this.txModel.create([{
    userId: sender.userId, accountId: sender._id, referenceNumber: ref,
    type: TransactionType.INTRABANK_TRANSFER, status: TransactionStatus.COMPLETED, direction: TransactionDirection.DEBIT,
    amount: dto.amount, fee: 0, currency: sender.currency || 'USD',
    description: dto.description ?? 'Transfer',
    senderAccountNumber: sender.accountNumber, recipientAccountNumber: recipient.accountNumber,
    recipientName: dto.recipientName ?? 'Account Holder', balanceAfter: sender.balance, processedAt: new Date(),
    metadata: { adminAction: true, adminId: admin._id },
  }]);
 
  // Credit TX — shows in recipient's transaction history
  await this.txModel.create([{
    userId: recipient.userId, accountId: recipient._id, referenceNumber: `${ref}-CR`,
    type: TransactionType.INTRABANK_TRANSFER, status: TransactionStatus.COMPLETED, direction: TransactionDirection.CREDIT,
    amount: dto.amount, fee: 0, currency: recipient.currency || 'USD',
    description: `Transfer from ${sender.accountNumber}`,
    senderAccountNumber: sender.accountNumber, recipientAccountNumber: recipient.accountNumber,
    balanceAfter: recipient.balance, processedAt: new Date(),
    metadata: { adminAction: true, adminId: admin._id },
  }]);
 
  await this.log(admin, 'ADMIN_INTRABANK_TRANSFER', 'account', sender._id as Types.ObjectId, {}, { amount: dto.amount, from: sender.accountNumber, to: dto.toAccountNumber, ref });
  return { success: true, referenceNumber: ref, amount: dto.amount };
}

async adminInterbankTransfer(
  dto: { fromAccountId: string; toAccountNumber: string; toRoutingNumber: string; toBankName: string; recipientName: string; amount: number; description?: string; },
  admin: UserDocument,
) {
  const sender = await this.accountModel.findById(dto.fromAccountId);
  if (!sender) throw new NotFoundException('Source account not found');
  if (sender.status === AccountStatus.FROZEN) throw new BadRequestException('Account is frozen');
 
  const fee = dto.amount > 1000 ? 5 : 2.5;
  const total = dto.amount + fee;
  if (sender.availableBalance < total) throw new BadRequestException('Insufficient funds');
 
  sender.balance -= total; sender.availableBalance -= total; sender.totalWithdrawn += total;
  await sender.save();
 
  const ref = generateReference('ACH');
  await this.txModel.create({
    userId: sender.userId, accountId: sender._id, referenceNumber: ref,
    type: TransactionType.INTERBANK_TRANSFER, status: TransactionStatus.PROCESSING, direction: TransactionDirection.DEBIT,
    amount: dto.amount, fee, currency: sender.currency || 'USD',
    description: dto.description ?? 'ACH Transfer',
    senderAccountNumber: sender.accountNumber, senderRoutingNumber: '021000021',
    recipientAccountNumber: dto.toAccountNumber, recipientRoutingNumber: dto.toRoutingNumber,
    recipientBankName: dto.toBankName, recipientName: dto.recipientName,
    balanceAfter: sender.balance, metadata: { adminAction: true, adminId: admin._id },
  });
 
  await this.log(admin, 'ADMIN_ACH_TRANSFER', 'account', sender._id as Types.ObjectId, {}, { amount: dto.amount, fee, ref });
  return { success: true, referenceNumber: ref, amount: dto.amount, fee, note: 'ACH settles in 1–2 business days' };
}
 


async adminInternationalTransfer(
  dto: { fromAccountId: string; recipientName: string; recipientBank: string; swiftCode: string; ibanNumber: string; recipientCountry: string; amount: number; currency: string; description?: string; },
  admin: UserDocument,
) {
  const sender = await this.accountModel.findById(dto.fromAccountId);
  if (!sender) throw new NotFoundException('Source account not found');
  if (sender.status === AccountStatus.FROZEN) throw new BadRequestException('Account is frozen');
 
  const fee = Math.min(dto.amount * 0.02, 50);
  const total = dto.amount + fee;
  if (sender.availableBalance < total) throw new BadRequestException('Insufficient funds');
 
  sender.balance -= total; sender.availableBalance -= total; sender.totalWithdrawn += total;
  await sender.save();
 
  const ref = generateReference('WIRE');
  await this.txModel.create({
    userId: sender.userId, accountId: sender._id, referenceNumber: ref,
    type: TransactionType.INTERNATIONAL_TRANSFER, status: TransactionStatus.PROCESSING, direction: TransactionDirection.DEBIT,
    amount: dto.amount, fee, currency: dto.currency || 'USD',
    description: dto.description ?? 'International Wire Transfer',
    senderAccountNumber: sender.accountNumber, recipientName: dto.recipientName,
    recipientBankName: dto.recipientBank, recipientCountry: dto.recipientCountry,
    swiftCode: dto.swiftCode, ibanNumber: dto.ibanNumber,
    balanceAfter: sender.balance, metadata: { adminAction: true, adminId: admin._id },
  });
 
  await this.log(admin, 'ADMIN_WIRE_TRANSFER', 'account', sender._id as Types.ObjectId, {}, { amount: dto.amount, fee, currency: dto.currency, ref });
  return { success: true, referenceNumber: ref, amount: dto.amount, fee, note: 'Wire processes in 2–5 business days' };
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
        .populate('userId', 'username email firstName lastName ')
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
 
  // Build the $set payload — only include fields that were actually provided
  const $set: Record<string, any> = {};
 
  // Core fields
  if (dto.status      !== undefined) $set.status      = dto.status;
  if (dto.direction   !== undefined) $set.direction   = dto.direction;
  if (dto.type        !== undefined) $set.type        = dto.type;
  if (dto.amount      !== undefined) $set.amount      = dto.amount;
  if (dto.fee         !== undefined) $set.fee         = dto.fee;
  if (dto.currency    !== undefined) $set.currency    = dto.currency;
  if (dto.description !== undefined) $set.description = dto.description;
  if (dto.balanceAfter!== undefined) $set.balanceAfter= dto.balanceAfter;
  if (dto.referenceNumber !== undefined) $set.referenceNumber = dto.referenceNumber;
 
  // Backdating — use $set directly so Mongoose timestamps option doesn't override
  // Mongoose's { timestamps: true } only auto-updates on save/update,
  // but a raw $set on createdAt/updatedAt bypasses that protection.
  if (dto.createdAt !== undefined) {
    const d = new Date(dto.createdAt);
    if (!isNaN(d.getTime())) $set.createdAt = d;
  }
  if (dto.processedAt !== undefined) {
    const d = new Date(dto.processedAt);
    if (!isNaN(d.getTime())) $set.processedAt = d;
  }
 
  // Recipient fields
  if (dto.recipientName           !== undefined) $set.recipientName           = dto.recipientName;
  if (dto.recipientAccountNumber  !== undefined) $set.recipientAccountNumber  = dto.recipientAccountNumber;
  if (dto.recipientBankName       !== undefined) $set.recipientBankName       = dto.recipientBankName;
  if (dto.recipientRoutingNumber  !== undefined) $set.recipientRoutingNumber  = dto.recipientRoutingNumber;
  if (dto.recipientCountry        !== undefined) $set.recipientCountry        = dto.recipientCountry;
 
  // Sender fields — makes credits look like real incoming transfers
  if (dto.senderName          !== undefined) $set.senderName          = dto.senderName;
  if (dto.senderAccountNumber !== undefined) $set.senderAccountNumber = dto.senderAccountNumber;
  if (dto.senderBankName      !== undefined) $set.senderBankName      = dto.senderBankName;
 
  // Wire fields
  if (dto.swiftCode  !== undefined) $set.swiftCode  = dto.swiftCode;
  if (dto.ibanNumber !== undefined) $set.ibanNumber = dto.ibanNumber;
 
  // Admin notes go into metadata — NEVER in user-visible fields
  if (dto.adminNotes !== undefined) {
    $set['metadata.adminNotes']    = dto.adminNotes;
    $set['metadata.lastEditedBy']  = admin._id;
    $set['metadata.lastEditedAt']  = new Date();
  } else {
    // Still track who last edited even without a note
    $set['metadata.lastEditedBy'] = admin._id;
    $set['metadata.lastEditedAt'] = new Date();
  }
 
  // Use updateOne with $set so timestamps: true doesn't fight us on createdAt
  await this.txModel.updateOne(
    { _id: txId },
    { $set },
    { timestamps: false },   // ← critical: prevent Mongoose from auto-setting updatedAt and blocking createdAt edit
  );
 
  const updated = await this.txModel.findById(txId).lean();
 
  // Regenerate receipt PDF if status changed to completed
  if (dto.status === 'completed' && updated) {
    const receiptUrl = await this.receiptsService
      .generatePdfReceipt(updated)
      .catch(() => '');
    if (receiptUrl) {
      await this.txModel.updateOne({ _id: txId }, { $set: { receiptUrl } }, { timestamps: false });
    }
  }
 
  await this.log(
    admin,
    'UPDATE_TRANSACTION',
    'transaction',
    tx._id as Types.ObjectId,
    before,
    { ...$set, _editedFields: Object.keys($set) },
  );
 
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



  async toggleTransferBlock(
  userId: string,
  transferBlocked: boolean,
  reason: string | undefined,
  admin: UserDocument,
) {
  const user = await this.userModel.findById(userId);
  if (!user) throw new NotFoundException('User not found');
  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
    throw new ForbiddenException('Cannot restrict an admin account');
  }
 
  const before = { transferBlocked: user.transferBlocked };
 
  await this.userModel.findByIdAndUpdate(userId, {
    transferBlocked,
    transferBlockReason: transferBlocked ? (reason ?? 'Blocked by admin') : null,
    transferBlockedAt:   transferBlocked ? new Date() : null,
  });
 
  await this.log(
    admin,
    transferBlocked ? 'BLOCK_TRANSFERS' : 'UNBLOCK_TRANSFERS',
    'user',
    user._id as Types.ObjectId,
    before,
    { transferBlocked, reason },
  );
 
  return {
    message: transferBlocked
      ? `Transfers blocked for ${user.username}`
      : `Transfers unblocked for ${user.username}`,
    transferBlocked,
  };
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
    const loanUserId = (loan.userId as any)?._id ?? loan.userId;
       const account = await this.accountModel.findOne({
       userId:    new Types.ObjectId(String(loanUserId)),
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

 async reviewKyc(
  kycId:    string,
  dto:      { status: string; rejectionNote?: string },
  admin:    UserDocument,
) {
  // 1. Find and update the KYC document
  const kyc = await this.kycModel.findByIdAndUpdate(
    kycId,
    {
      status:        dto.status,
      rejectionNote: dto.rejectionNote ?? undefined,
      reviewedAt:    new Date(),
      reviewedBy:    String(admin._id),
    },
    { new: true },
  );
 
  if (!kyc) throw new NotFoundException('KYC submission not found');
 
  // 2. ← THIS IS THE MISSING STEP — sync User.kycStatus
  //    Without this, loans/investments/transfers that check
  //    user.kycStatus will still see the old value.
  await this.userModel.findByIdAndUpdate(
    kyc.userId,
    { kycStatus: dto.status },   // mirrors the KYC document status exactly
  );
 
  // 3. Send notification to user
  const user = await this.userModel.findById(kyc.userId);
  if (user) {
    if (dto.status === 'approved') {
      await this.notificationsService
        .sendKycApprovedEmail(user.email, user.firstName)
        .catch(() => null);
    } else if (dto.status === 'rejected' || dto.status === 'resubmit') {
      await this.notificationsService
        .sendKycRejectedEmail(user.email, user.firstName, dto.rejectionNote ?? '')
        .catch(() => null);
    }
  }
 
  // 4. Audit log
  await this.log(
    admin,
    `KYC_${dto.status.toUpperCase()}`,
    'kyc',
    kyc._id as Types.ObjectId,
    { status: kyc.status },
    { status: dto.status },
  );
 
  return { message: `KYC ${dto.status}`, kyc };
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
    ...(dto.decision === 'approved' ? { filledAt: new Date() } : {}),
  });
 
  if (dto.decision === 'rejected') {
    const refundAmt = +(investment.totalInvested * 1.001).toFixed(2); // total + fee
    const account = await this.accountModel.findById(investment.accountId);
    if (account) {
      account.balance          += refundAmt;
      account.availableBalance += refundAmt;  
      account.totalWithdrawn   = Math.max(0, account.totalWithdrawn - refundAmt);
      await account.save();
    }
  }
 
  await this.log(admin, `INVESTMENT_${dto.decision.toUpperCase()}`, 'investment',
    investment._id as Types.ObjectId, before, { orderStatus: newStatus });
 
  return { message: `Stock investment ${dto.decision}` };
}

  // ══════════════════════════════════════════════════════════════
  // CRYPTO ADDRESS MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async getAllCryptoAddresses() {
  // Return ALL addresses (both active and hidden) for admin view
  return this.cryptoAddrModel.find().sort({ coin: 1, network: 1 }).lean();
}
 
async upsertCryptoAddress(dto: UpsertCryptoAddressDto, admin: UserDocument) {
  const existing = await this.cryptoAddrModel.findOne({ network: dto.network });
  const before   = existing?.toObject() ?? {};
 
  const address = await this.cryptoAddrModel.findOneAndUpdate(
    { network: dto.network },
    {
      network:               dto.network,
      coin:                  dto.coin,
      address:               dto.address,
      label:                 dto.label ?? undefined,
      memo:                  dto.memo  ?? undefined,
      qrCodeUrl:             dto.qrCodeUrl ?? undefined,
      isActive:              dto.isActive ?? true,
      minimumDeposit:        dto.minimumDeposit ?? 0,
      confirmationsRequired: dto.confirmationsRequired ?? 1,
      lastUpdatedBy:         String(admin._id),
    },
    { upsert: true, new: true },
  );
 
  await this.log(
    admin,
    existing ? 'UPDATE_CRYPTO_ADDRESS' : 'CREATE_CRYPTO_ADDRESS',
    'crypto_address',
    address._id as Types.ObjectId,
    before,
    dto,
  );
  return address;
}
 async reviewCryptoInvestment(
    investmentId: string,
    dto: ReviewInvestmentDto,
    admin: UserDocument,
  ) {
    const investment = await this.cryptoInvestModel.findById(investmentId);
    if (!investment) throw new NotFoundException('Crypto investment not found');
 
    const before    = { orderStatus: investment.orderStatus };
    const newStatus = dto.decision === 'approved' ? 'filled' : 'cancelled';
 
    await this.cryptoInvestModel.findByIdAndUpdate(investmentId, {
      orderStatus: newStatus,
      ...(dto.decision === 'approved' ? { filledAt: new Date() } : {}),
    });
 
    if (dto.decision === 'rejected') {
      const refund  = +(investment.amountUSD * 1.001).toFixed(2);
      const account = await this.accountModel.findById(investment.accountId);
      if (account) {
        account.balance          += refund;
        account.availableBalance += refund;
        account.totalWithdrawn    = Math.max(0, account.totalWithdrawn - refund);
        await account.save();
      }
    }
 
    await this.log(
      admin,
      `CRYPTO_INVESTMENT_${dto.decision.toUpperCase()}`,
      'crypto_investment',
      investment._id as Types.ObjectId,
      before,
      { orderStatus: newStatus },
    );
 
    return { message: `Crypto investment ${dto.decision}` };
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
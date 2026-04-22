import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Loan, LoanDocument, LoanStatus } from './schemas/loan.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { LoanRepaymentDto } from './dto/loan.dto';
import { OtpService } from '../otp/otp.service';

@Injectable()
export class LoansService {
  constructor(
    @InjectModel(Loan.name)    private loanModel:    Model<LoanDocument>,
    @InjectModel(User.name)    private userModel:    Model<UserDocument>,
    @InjectModel(Account.name) private accountModel: Model<AccountDocument>,
    private notificationsService: NotificationsService,
    private otpService: OtpService,
  ) {}

  async applyForLoan(userId: string, dto: {
    loanType: string; requestedAmount: number; termMonths: number;
    purpose: string; annualIncome: number; collateral?: string;
  }) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.kycStatus !== 'approved') throw new BadRequestException('KYC must be approved to apply for a loan');

    // Debt-to-income ratio
    const existingLoans = await this.loanModel.find({ userId, status: LoanStatus.ACTIVE });
    const monthlyDebt   = existingLoans.reduce((s, l) => s + (l.monthlyPayment || 0), 0);
    const dti           = dto.annualIncome > 0 ? (monthlyDebt / (dto.annualIncome / 12)) * 100 : 100;

    // Basic underwriting
    const interestRate = this.calculateRate(user.creditScore, dto.loanType);
    const monthlyPayment = this.calcMonthlyPayment(dto.requestedAmount, interestRate, dto.termMonths);

    const loan = await this.loanModel.create({
      userId:                     new Types.ObjectId(userId),
      loanType:                   dto.loanType,
      requestedAmount:            dto.requestedAmount,
      termMonths:                 dto.termMonths,
      purpose:                    dto.purpose,
      annualIncomeAtApplication:  dto.annualIncome,
      creditScoreAtApplication:   user.creditScore,
      debtToIncomeRatio:          +dti.toFixed(2),
      interestRate,
      monthlyPayment,
      collateral:                 dto.collateral,
      status:                     LoanStatus.UNDER_REVIEW,
    });

    return { message: 'Loan application submitted. You will be notified within 2 business days.', loan };
  }

  async getUserLoans(userId: string) {
    return this.loanModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).lean();
  }

  async getCreditProfile(userId: string) {
    const user  = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const loans = await this.loanModel.find({ userId: new Types.ObjectId(userId) }).lean();

    const activeLoans   = loans.filter((l) => l.status === LoanStatus.ACTIVE);
    const totalOwed     = activeLoans.reduce((s, l) => s + (l.outstandingBalance || 0), 0);
    const totalLimit    = user.totalCreditLimit;
    const utilization   = totalLimit > 0 ? +((totalOwed / totalLimit) * 100).toFixed(1) : 0;

    return {
      creditScore:       user.creditScore,
      creditRating:      user.creditRating,
      totalCreditLimit:  totalLimit,
      creditUtilization: utilization,
      activeLoans:       activeLoans.length,
      totalAmountOwed:   totalOwed,
      loanHistory:       loans,
      tips:              this.getCreditTips(user.creditScore),
    };
  }

  private calculateRate(creditScore: number, type: string): number {
    const base: Record<string, number> = {
      personal:       10.99, mortgage: 6.5, auto: 5.99,
      business:       8.99,  student:  4.5, line_of_credit: 12.99,
    };
    const b    = base[type] ?? 10.99;
    if (creditScore >= 750) return +(b - 2).toFixed(2);
    if (creditScore >= 700) return +(b - 1).toFixed(2);
    if (creditScore >= 650) return b;
    if (creditScore >= 600) return +(b + 2).toFixed(2);
    return +(b + 5).toFixed(2);
  }

  private calcMonthlyPayment(principal: number, annualRate: number, months: number): number {
    const r = annualRate / 100 / 12;
    return r === 0 ? principal / months : +(principal * r / (1 - Math.pow(1 + r, -months))).toFixed(2);
  }

  private getCreditTips(score: number): string[] {
    if (score >= 750) return ['Excellent! You qualify for the best rates.'];
    if (score >= 700) return ['Pay bills on time to reach excellent credit.', 'Keep utilization below 30%.'];
    if (score >= 650) return ['Reduce outstanding balances.', 'Avoid new credit applications.'];
    return ['Focus on on-time payments.', 'Reduce credit card balances.', 'Dispute any errors on your report.'];
  }


  async getLoanById(loanId: string, userId: string) {
  const loan = await this.loanModel.findOne({
    _id:    new Types.ObjectId(loanId),
    userId: new Types.ObjectId(userId),
  }).lean();
  if (!loan) throw new NotFoundException('Loan not found');
  return loan;
}

async initiateRepayment(
  userId: string,
  body:   { loanId: string; accountId: string; amount: number },
  userEmail: string,
) {
  const loan = await this.loanModel.findOne({
    _id:    new Types.ObjectId(body.loanId),
    userId: new Types.ObjectId(userId),
  });
  if (!loan) throw new NotFoundException('Loan not found');
  if (loan.status !== LoanStatus.ACTIVE)
    throw new BadRequestException('Loan is not active');

  const otp = this.otpService.generate();
  this.otpService.save(this.otpService.buildKey(userId, 'loan_repayment'), otp);
  await this.notificationsService.sendOtpEmail(userEmail, otp, 'transfer_confirmation');
  return { message: 'OTP sent. Confirm to complete repayment.', requiresOtp: true };
}

async repayLoan(userId: string, dto: LoanRepaymentDto, user: any) {
  this.otpService.verify(this.otpService.buildKey(userId, 'loan_repayment'), dto.otp);

  const loan = await this.loanModel.findOne({
    _id:    new Types.ObjectId(dto.loanId),
    userId: new Types.ObjectId(userId),
  });
  if (!loan)                          throw new NotFoundException('Loan not found');
  if (loan.status !== LoanStatus.ACTIVE) throw new BadRequestException('Loan is not active');

  const account = await this.accountModel.findOne({
    _id:    new Types.ObjectId(dto.accountId),
    userId: new Types.ObjectId(userId),
  });
  if (!account)                          throw new NotFoundException('Account not found');
  if (account.availableBalance < dto.amount) throw new BadRequestException('Insufficient funds');

  account.balance          -= dto.amount;
  account.availableBalance -= dto.amount;
  account.totalWithdrawn   += dto.amount;
  await account.save();

  const newBalance = +(loan.outstandingBalance - dto.amount).toFixed(2);
  const isPaidOff  = newBalance <= 0;

  await this.loanModel.findByIdAndUpdate(loan._id, {
    outstandingBalance: isPaidOff ? 0 : newBalance,
    status:   isPaidOff ? LoanStatus.PAID_OFF : LoanStatus.ACTIVE,
    paidOffAt: isPaidOff ? new Date() : undefined,
  });

  // Update credit score on repayment
  const newScore = Math.min(850, (user.creditScore || 600) + 5);
  await this.userModel.findByIdAndUpdate(userId, { creditScore: newScore });

  await this.notificationsService.sendLoanStatusEmail(
    user.email, user.firstName, isPaidOff ? 'paid off' : 'repayment received', dto.amount,
  );

  return {
    success:           true,
    amountPaid:        dto.amount,
    remainingBalance:  isPaidOff ? 0 : newBalance,
    loanStatus:        isPaidOff ? 'paid_off' : 'active',
    message:           isPaidOff ? '🎉 Congratulations! Your loan is fully paid off.' : 'Repayment successful.',
  };
}
}
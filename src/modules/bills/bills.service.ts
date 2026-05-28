import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Bill, BillDocument, BillStatus } from './schemas/bill.schema';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import { Transaction, TransactionDocument, TransactionType, TransactionStatus, TransactionDirection } from '../transactions/schemas/transaction.schema';
import { OtpService } from '../otp/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { generateReference } from '../../common/utils/generate-ref.util';
import { PayBillDto } from './dto/pay-bill.dto';

@Injectable()
export class BillsService {
  constructor(
    @InjectModel(Bill.name)        private billModel:    Model<BillDocument>,
    @InjectModel(Account.name)     private accountModel: Model<AccountDocument>,
    @InjectModel(Transaction.name) private txModel:      Model<TransactionDocument>,
    private readonly otpService:           OtpService,
    private readonly notificationsService: NotificationsService,
    private readonly receiptsService:      ReceiptsService,
  ) {}

  // ── Initiate — sends OTP ──────────────────────────────────────
  async initiateBillPayment(
    userId: string,
    dto: Omit<PayBillDto, 'otp'>,
    userEmail: string,
  ) {
    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(dto.accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.availableBalance < dto.amount)
      throw new BadRequestException(`Insufficient funds. Available: $${account.availableBalance}`);

    const otp = this.otpService.generate();
    this.otpService.save(this.otpService.buildKey(userId, 'bill_payment'), otp);
    await this.notificationsService.sendOtpEmail(userEmail, otp, 'transfer_confirmation');

    return { message: 'OTP sent. Confirm to complete bill payment.', requiresOtp: true };
  }

  // ── Confirm Payment ───────────────────────────────────────────
  async confirmBillPayment(userId: string, dto: PayBillDto, user: any) {
    // Verify OTP
    this.otpService.verify(this.otpService.buildKey(userId, 'bill_payment'), dto.otp);

    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(dto.accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.availableBalance < dto.amount)
      throw new BadRequestException('Insufficient funds');

    const ref = generateReference('BILL');

    // Debit account
    account.balance          -= dto.amount;
    account.availableBalance -= dto.amount;
    account.totalWithdrawn   += dto.amount;
    await account.save();

    // Create bill record
    const bill = await this.billModel.create({
      userId:      new Types.ObjectId(userId),
      accountId:   account._id,
      billerName:  dto.billerName,
      billerCode:  dto.billerCode,
      accountRef:  dto.accountRef,
      amount:      dto.amount,
      category:    dto.category,
      status:      BillStatus.PAID,
      referenceNumber: ref,
      description: dto.description,
      isRecurring: dto.isRecurring ?? false,
      recurringDay: dto.recurringDay,
      paidAt:      new Date(),
    });

    // Record transaction
    const tx = await this.txModel.create({
      userId:      new Types.ObjectId(userId),
      accountId:   account._id,
      referenceNumber: ref,
      type:        TransactionType.BILL_PAYMENT,
      status:      TransactionStatus.COMPLETED,
      direction:   TransactionDirection.DEBIT,
      amount:      dto.amount,
      fee:         0,
      currency:    'USD',
      description: `Bill Payment — ${dto.billerName} (${dto.accountRef})`,
      recipientName: dto.billerName,
      balanceAfter: account.balance,
      processedAt: new Date(),
      metadata:    { billerCode: dto.billerCode, accountRef: dto.accountRef, category: dto.category },
    });

    // Generate receipt
    const receiptUrl = await this.receiptsService.generatePdfReceipt(tx);
    await this.billModel.findByIdAndUpdate(bill._id, { receiptUrl });

    // Send notification
    await this.notificationsService.sendTransferAlert(user.email, {
      direction: 'debit',
      amount:    dto.amount,
      fee:       0,
      ref,
      type:      'bill_payment',
      balance:   account.balance,
    });

    return { success: true, referenceNumber: ref, bill, receiptUrl };
  }

  // ── Get Bills History ─────────────────────────────────────────
  async getUserBills(userId: string) {
    return this.billModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  // ── Get Popular Billers ───────────────────────────────────────
  getPopularBillers() {
    return [
      { name: 'ConEdison',          code: 'CONED',       category: 'electricity' },
      { name: 'National Grid',      code: 'NATGRID',     category: 'electricity' },
      { name: 'NYC Water Board',    code: 'NYCWATER',    category: 'water'       },
      { name: 'Verizon',            code: 'VERIZON',     category: 'phone'       },
      { name: 'AT&T',               code: 'ATT',         category: 'phone'       },
      { name: 'T-Mobile',           code: 'TMOBILE',     category: 'phone'       },
      { name: 'Spectrum',           code: 'SPECTRUM',    category: 'internet'    },
      { name: 'Xfinity',            code: 'XFINITY',     category: 'internet'    },
      { name: 'Netflix',            code: 'NETFLIX',     category: 'subscription'},
      { name: 'Spotify',            code: 'SPOTIFY',     category: 'subscription'},
      { name: 'Amazon Prime',       code: 'AMAZON',      category: 'subscription'},
      { name: 'National Gas',       code: 'NATGAS',      category: 'gas'         },
      { name: 'State Farm',         code: 'STATEFARM',   category: 'insurance'   },
      { name: 'Geico',              code: 'GEICO',       category: 'insurance'   },
    ];
  }
}


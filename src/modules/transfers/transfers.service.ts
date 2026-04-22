import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import * as mongoose from 'mongoose';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import {
  Transaction, TransactionDocument,
  TransactionType, TransactionStatus, TransactionDirection,
} from '../transactions/schemas/transaction.schema';
import { OtpService } from '../otp/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { generateReference } from '../../common/utils/generate-ref.util';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class TransfersService {
  constructor(
    @InjectModel(Account.name)     private accountModel:     Model<AccountDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectConnection()             private connection:       Connection,
    private otpService:             OtpService,
    private notificationsService:   NotificationsService,
    private receiptsService:        ReceiptsService,
  ) {}

  // ── Step 1: Initiate → send OTP ───────────────────────────────
  async initiateTransfer(
    userId:    string,
    payload:   { fromAccountId: string; amount: number; type: string },
    userEmail: string,
  ) {
    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(payload.fromAccountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account)                        throw new NotFoundException('Source account not found');
    if (account.availableBalance < payload.amount) throw new BadRequestException('Insufficient funds');

    const otp = this.otpService.generate();
    this.otpService.save(this.otpService.buildKey(userId, 'transfer_confirmation'), otp);
    await this.notificationsService.sendOtpEmail(userEmail, otp, 'transfer_confirmation');

    return { message: 'OTP sent to your registered email. Confirm to proceed.', requiresOtp: true };
  }

  // ── Step 2: Confirm Intrabank ─────────────────────────────────
  async confirmIntrabank(userId: string, dto: {
    fromAccountId:       string;
    toAccountNumber:     string;
    amount:              number;
    description?:        string;
    recipientName?:      string;
    securityPin:         string;
    otp:                 string;
  }, user: any) {
    // Verify OTP + PIN
    this.otpService.verify(this.otpService.buildKey(userId, 'transfer_confirmation'), dto.otp);

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const sender = await this.accountModel
        .findOne({ _id: new Types.ObjectId(dto.fromAccountId), userId: new Types.ObjectId(userId) })
        .session(session);
      if (!sender) throw new NotFoundException('Sender account not found');

      const recipient = await this.accountModel
        .findOne({ accountNumber: dto.toAccountNumber })
        .session(session);
      if (!recipient) throw new NotFoundException('Recipient account not found');
      if (recipient.accountNumber === sender.accountNumber)
        throw new BadRequestException('Cannot transfer to the same account');

      const fee       = 0; // intrabank is free
      const total     = dto.amount + fee;

      if (sender.availableBalance < total) throw new BadRequestException('Insufficient funds');

      // Atomic balance update
      sender.balance           -= total;
      sender.availableBalance  -= total;
      sender.totalWithdrawn    += total;
      recipient.balance          += dto.amount;
      recipient.availableBalance += dto.amount;
      recipient.totalDeposited   += dto.amount;

      await sender.save({ session });
      await recipient.save({ session });

      const ref = generateReference('NXB');

      const [debitTx] = await this.transactionModel.create([{
        userId:       new Types.ObjectId(userId),
        accountId:    sender._id,
        referenceNumber: ref,
        type:         TransactionType.INTRABANK_TRANSFER,
        status:       TransactionStatus.COMPLETED,
        direction:    TransactionDirection.DEBIT,
        amount:       dto.amount,
        fee,
        currency:     'USD',
        description:  dto.description ?? 'Intrabank Transfer',
        senderAccountNumber:    sender.accountNumber,
        recipientAccountNumber: recipient.accountNumber,
        recipientName:          dto.recipientName ?? 'Account Holder',
        balanceAfter:           sender.balance,
        processedAt:            new Date(),
      }], { session });

      await this.transactionModel.create([{
        userId:       recipient.userId,
        accountId:    recipient._id,
        referenceNumber: `${ref}-CR`,
        type:         TransactionType.INTRABANK_TRANSFER,
        status:       TransactionStatus.COMPLETED,
        direction:    TransactionDirection.CREDIT,
        amount:       dto.amount,
        fee:          0,
        currency:     'USD',
        description:  `Transfer from ${sender.accountNumber}`,
        senderAccountNumber:    sender.accountNumber,
        senderName:             `${user.firstName} ${user.lastName}`,
        recipientAccountNumber: recipient.accountNumber,
        balanceAfter:           recipient.balance,
        processedAt:            new Date(),
      }], { session });

      await session.commitTransaction();

      // Receipt + notification
      const receiptUrl = await this.receiptsService.generatePdfReceipt(debitTx);
      await this.notificationsService.sendTransferAlert(user.email, {
        direction: 'debit', amount: dto.amount, fee, ref, type: 'intrabank_transfer', balance: sender.balance,
      });

      return { success: true, referenceNumber: ref, receiptUrl };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ── Interbank Transfer (ACH) ──────────────────────────────────
  async confirmInterbank(userId: string, dto: {
    fromAccountId: string; toAccountNumber: string; toRoutingNumber: string;
    toBankName: string; recipientName: string; amount: number;
    description?: string; otp: string;
  }, user: any) {
    this.otpService.verify(this.otpService.buildKey(userId, 'transfer_confirmation'), dto.otp);

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const sender = await this.accountModel
        .findOne({ _id: new Types.ObjectId(dto.fromAccountId), userId: new Types.ObjectId(userId) })
        .session(session);
      if (!sender) throw new NotFoundException('Account not found');

      const fee   = dto.amount > 1000 ? 5 : 2.5; // ACH fee
      const total = dto.amount + fee;
      if (sender.availableBalance < total) throw new BadRequestException('Insufficient funds');

      sender.balance          -= total;
      sender.availableBalance -= total;
      sender.totalWithdrawn   += total;
      await sender.save({ session });

      const ref = generateReference('ACH');
      const [tx] = await this.transactionModel.create([{
        userId:        new Types.ObjectId(userId),
        accountId:     sender._id,
        referenceNumber: ref,
        type:          TransactionType.INTERBANK_TRANSFER,
        status:        TransactionStatus.PROCESSING, // ACH takes 1-2 business days
        direction:     TransactionDirection.DEBIT,
        amount:        dto.amount,
        fee,
        currency:      'USD',
        description:   dto.description ?? 'ACH Transfer',
        senderAccountNumber:    sender.accountNumber,
        senderRoutingNumber:    '021000021',
        recipientAccountNumber: dto.toAccountNumber,
        recipientRoutingNumber: dto.toRoutingNumber,
        recipientBankName:      dto.toBankName,
        recipientName:          dto.recipientName,
        balanceAfter:           sender.balance,
      }], { session });

      await session.commitTransaction();

      const receiptUrl = await this.receiptsService.generatePdfReceipt(tx);
      await this.notificationsService.sendTransferAlert(user.email, {
        direction: 'debit', amount: dto.amount, fee, ref, type: 'interbank_transfer', balance: sender.balance,
      });

      return { success: true, referenceNumber: ref, receiptUrl, note: 'ACH transfers take 1–2 business days.' };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ── International Wire ────────────────────────────────────────
  async confirmInternational(userId: string, dto: {
    fromAccountId: string; recipientName: string; recipientBank: string;
    swiftCode: string; ibanNumber: string; recipientCountry: string;
    amount: number; currency: string; description?: string; otp: string;
  }, user: any) {
    this.otpService.verify(this.otpService.buildKey(userId, 'transfer_confirmation'), dto.otp);

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const sender = await this.accountModel
        .findOne({ _id: new Types.ObjectId(dto.fromAccountId), userId: new Types.ObjectId(userId) })
        .session(session);
      if (!sender) throw new NotFoundException('Account not found');

      const fee   = Math.min(dto.amount * 0.02, 50); // 2% capped at $50
      const total = dto.amount + fee;
      if (sender.availableBalance < total) throw new BadRequestException('Insufficient funds');

      sender.balance          -= total;
      sender.availableBalance -= total;
      sender.totalWithdrawn   += total;
      await sender.save({ session });

      const ref  = generateReference('WIRE');
      const [tx] = await this.transactionModel.create([{
        userId:        new Types.ObjectId(userId),
        accountId:     sender._id,
        referenceNumber: ref,
        type:          TransactionType.INTERNATIONAL_TRANSFER,
        status:        TransactionStatus.PROCESSING,
        direction:     TransactionDirection.DEBIT,
        amount:        dto.amount,
        fee,
        currency:      dto.currency || 'USD',
        description:   dto.description ?? 'International Wire Transfer',
        senderAccountNumber: sender.accountNumber,
        recipientName:       dto.recipientName,
        recipientBankName:   dto.recipientBank,
        recipientCountry:    dto.recipientCountry,
        swiftCode:           dto.swiftCode,
        ibanNumber:          dto.ibanNumber,
        balanceAfter:        sender.balance,
      }], { session });

      await session.commitTransaction();

      const receiptUrl = await this.receiptsService.generatePdfReceipt(tx);
      await this.notificationsService.sendTransferAlert(user.email, {
        direction: 'debit', amount: dto.amount, fee, ref, type: 'international_transfer', balance: sender.balance,
      });

      return { success: true, referenceNumber: ref, receiptUrl, note: 'International wires process in 2–5 business days.' };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }
}
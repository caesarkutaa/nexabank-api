import {
  Injectable, BadRequestException, NotFoundException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import {
  Transaction, TransactionDocument,
  TransactionType, TransactionStatus, TransactionDirection,
} from '../transactions/schemas/transaction.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { OtpService } from '../otp/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { generateReference } from '../../common/utils/generate-ref.util';

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    @InjectModel(Account.name)     private accountModel:     Model<AccountDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(User.name)        private userModel:        Model<UserDocument>,
    @InjectConnection()            private connection:       Connection,
    private otpService:            OtpService,
    private notificationsService:  NotificationsService,
    private receiptsService:       ReceiptsService,
  ) {}

  // ── Step 1: Verify PIN → check blocks → send OTP ─────────────
  async initiateTransfer(
    userId:    string,
    payload:   { fromAccountId: string; amount: number; type: string; securityPin: string },
    userEmail: string,
  ) {
    await this.verifySecurityPin(userId, payload.securityPin);

    const userRecord = await this.userModel
      .findById(userId)
      .select('transferBlocked transferBlockReason');

    if (userRecord?.transferBlocked) {
      throw new ForbiddenException(
        'Your account has been restricted from making transfers. ' +
        'Please contact support at support@nexabank.com for assistance.',
      );
    }

    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(payload.fromAccountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Source account not found');
    if (account.status === 'frozen') {
      throw new ForbiddenException(
        'This account has been frozen. Please contact support@nexabank.com to resolve this.',
      );
    }
    if (account.availableBalance < payload.amount) {
      throw new BadRequestException('Insufficient funds');
    }

    const otp = this.otpService.generate();
    this.otpService.save(this.otpService.buildKey(userId, 'transfer_confirmation'), otp);
    await this.notificationsService.sendOtpEmail(userEmail, otp, 'transfer_confirmation');

    return { message: 'OTP sent to your registered email. Confirm to proceed.', requiresOtp: true };
  }

  // ── Private: verify PIN inline ────────────────────────────────
  private async verifySecurityPin(userId: string, pin: string): Promise<void> {
    if (!pin || !/^\d{6}$/.test(pin)) {
      throw new BadRequestException('A valid 6-digit security PIN is required');
    }
    const user = await this.userModel
      .findById(userId)
      .select('+securityPinHash hasPinSet pinAttempts pinLockedUntil')
      .lean();
    if (!user) throw new NotFoundException('User not found');

    if ((user as any).pinLockedUntil && new Date() < new Date((user as any).pinLockedUntil)) {
      const mins = Math.ceil(
        (new Date((user as any).pinLockedUntil).getTime() - Date.now()) / 60000,
      );
      throw new BadRequestException(
        `PIN temporarily locked. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`,
      );
    }

    if (!(user as any).hasPinSet || !(user as any).securityPinHash) {
      throw new BadRequestException(
        'Security PIN not set. Please go to Settings to set your PIN before making transfers.',
      );
    }

    const bcrypt = await import('bcryptjs');
    const match  = await bcrypt.compare(pin, (user as any).securityPinHash);

    if (!match) {
      const attempts = ((user as any).pinAttempts ?? 0) + 1;
      const MAX      = 3;

      if (attempts >= MAX) {
        await this.userModel.findByIdAndUpdate(userId, {
          pinAttempts:    0,
          pinLockedUntil: new Date(Date.now() + 15 * 60 * 1000),
        });
        throw new BadRequestException(
          'Incorrect PIN. Too many failed attempts — PIN locked for 15 minutes.',
        );
      } else {
        await this.userModel.findByIdAndUpdate(userId, { pinAttempts: attempts });
        const remaining = MAX - attempts;
        throw new BadRequestException(
          `Incorrect security PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        );
      }
    }

    await this.userModel.findByIdAndUpdate(userId, {
      pinAttempts:    0,
      pinLockedUntil: null,
    });
  }

  // ── Confirm Intrabank ─────────────────────────────────────────
  async confirmIntrabank(userId: string, dto: {
    fromAccountId:       string;
    toAccountNumber:     string;
    amount:              number;
    description?:        string;
    recipientName?:      string;
    securityPin:         string;
    otp:                 string;
    userTimezone?:       string;
  }, user: any) {
    this.otpService.verify(this.otpService.buildKey(userId, 'transfer_confirmation'), dto.otp);
    await this.verifySecurityPin(userId, dto.securityPin);

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

      const fee   = 0;
      const total = dto.amount + fee;
      if (sender.availableBalance < total) throw new BadRequestException('Insufficient funds');

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
        userId:                 new Types.ObjectId(userId),
        accountId:              sender._id,
        referenceNumber:        ref,
        type:                   TransactionType.INTRABANK_TRANSFER,
        status:                 TransactionStatus.COMPLETED,
        direction:              TransactionDirection.DEBIT,
        amount:                 dto.amount,
        fee,
        currency:               sender.currency || 'USD',
        description:            dto.description ?? 'Intrabank Transfer',
        senderAccountNumber:    sender.accountNumber,
        recipientAccountNumber: recipient.accountNumber,
        recipientName:          dto.recipientName ?? 'Account Holder',
        balanceAfter:           sender.balance,
        processedAt:            new Date(),
      }], { session });

      await this.transactionModel.create([{
        userId:                 recipient.userId,
        accountId:              recipient._id,
        referenceNumber:        `${ref}-CR`,
        type:                   TransactionType.INTRABANK_TRANSFER,
        status:                 TransactionStatus.COMPLETED,
        direction:              TransactionDirection.CREDIT,
        amount:                 dto.amount,
        fee:                    0,
        currency:               recipient.currency || 'USD',
        description:            `Transfer from ${sender.accountNumber}`,
        senderAccountNumber:    sender.accountNumber,
        senderName:             `${user.firstName} ${user.lastName}`,
        recipientAccountNumber: recipient.accountNumber,
        balanceAfter:           recipient.balance,
        processedAt:            new Date(),
      }], { session });

      await session.commitTransaction();
      this.logger.log(`[TRANSFERS] Intrabank committed — ref: ${ref}, debitTx._id: ${(debitTx as any)._id}`);

      // Generate receipt and save URL back to DB
      this.logger.log(`[TRANSFERS] Generating receipt for ${ref}...`);
      const receiptUrl = await this.receiptsService
        .generatePdfReceipt(debitTx, dto.userTimezone)
        .catch((err: any) => {
          this.logger.error(`[TRANSFERS] Receipt generation failed for ${ref}: ${err?.message ?? err}`);
          return '';
        });

      this.logger.log(`[TRANSFERS] Receipt result for ${ref}: "${receiptUrl || 'EMPTY/FAILED'}"`);

      if (receiptUrl) {
        await this.transactionModel.findByIdAndUpdate(
          (debitTx as any)._id,
          { receiptUrl },
        );
        this.logger.log(`[TRANSFERS] receiptUrl saved to DB for tx ${(debitTx as any)._id}`);
      } else {
        this.logger.warn(`[TRANSFERS] No receiptUrl generated for ${ref} — skipping DB save`);
      }

      this.notificationsService.sendTransferAlert(user.email, {
        direction:              'debit',
        amount:                 dto.amount,
        fee,
        ref,
        type:                   'intrabank_transfer',
        balance:                sender.balance,
        recipientName:          dto.recipientName,
        recipientAccountNumber: recipient.accountNumber,
        recipientBankName:      'NexaBank',
      }).catch(() => null);

      return { success: true, referenceNumber: ref, receiptUrl };

    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ── Confirm Interbank (ACH) ───────────────────────────────────
  // ACH transfers auto-complete after 5–48 hours via a scheduled
  // setTimeout. This simulates real ACH settlement windows.
  async confirmInterbank(userId: string, dto: {
    fromAccountId:   string;
    toAccountNumber: string;
    toRoutingNumber: string;
    toBankName:      string;
    recipientName:   string;
    amount:          number;
    description?:    string;
    securityPin:     string;
    otp:             string;
    userTimezone?:   string;
  }, user: any) {
    this.otpService.verify(this.otpService.buildKey(userId, 'transfer_confirmation'), dto.otp);
    await this.verifySecurityPin(userId, dto.securityPin);

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const sender = await this.accountModel
        .findOne({ _id: new Types.ObjectId(dto.fromAccountId), userId: new Types.ObjectId(userId) })
        .session(session);
      if (!sender) throw new NotFoundException('Account not found');

      const fee   = dto.amount > 1000 ? 5 : 2.5;
      const total = dto.amount + fee;
      if (sender.availableBalance < total) throw new BadRequestException('Insufficient funds');

      sender.balance          -= total;
      sender.availableBalance -= total;
      sender.totalWithdrawn   += total;
      await sender.save({ session });

      const ref  = generateReference('ACH');
      const [tx] = await this.transactionModel.create([{
        userId:                 new Types.ObjectId(userId),
        accountId:              sender._id,
        referenceNumber:        ref,
        type:                   TransactionType.INTERBANK_TRANSFER,
        status:                 TransactionStatus.PROCESSING,   // starts as processing
        direction:              TransactionDirection.DEBIT,
        amount:                 dto.amount,
        fee,
        currency:               sender.currency || 'USD',
        description:            dto.description ?? 'ACH Transfer',
        senderAccountNumber:    sender.accountNumber,
        senderRoutingNumber:    '021000021',
        recipientAccountNumber: dto.toAccountNumber,
        recipientRoutingNumber: dto.toRoutingNumber,
        recipientBankName:      dto.toBankName,
        recipientName:          dto.recipientName,
        balanceAfter:           sender.balance,
      }], { session });

      await session.commitTransaction();
      this.logger.log(`[TRANSFERS] Interbank committed — ref: ${ref}, tx._id: ${(tx as any)._id}`);

      // Generate receipt (processing state)
      this.logger.log(`[TRANSFERS] Generating receipt for ${ref}...`);
      const receiptUrl = await this.receiptsService
        .generatePdfReceipt(tx, dto.userTimezone)
        .catch((err: any) => {
          this.logger.error(`[TRANSFERS] Receipt generation failed for ${ref}: ${err?.message ?? err}`);
          return '';
        });

      this.logger.log(`[TRANSFERS] Receipt result for ${ref}: "${receiptUrl || 'EMPTY/FAILED'}"`);

      if (receiptUrl) {
        await this.transactionModel.findByIdAndUpdate(
          (tx as any)._id,
          { receiptUrl },
        );
        this.logger.log(`[TRANSFERS] receiptUrl saved to DB for tx ${(tx as any)._id}`);
      } else {
        this.logger.warn(`[TRANSFERS] No receiptUrl for ${ref} — skipping DB save`);
      }

      this.notificationsService.sendTransferAlert(user.email, {
        direction:              'debit',
        amount:                 dto.amount,
        fee,
        ref,
        type:                   'interbank_transfer',
        balance:                sender.balance,
        recipientName:          dto.recipientName,
        recipientAccountNumber: dto.toAccountNumber,
        recipientBankName:      dto.toBankName,
      }).catch(() => null);

      // ── ACH Auto-Settlement ───────────────────────────────────
      // Schedule status → completed between 5 hrs and 48 hrs
      // Random window: 5hr min, 48hr max, weighted toward 24hr
      this.scheduleAchSettlement(
        String((tx as any)._id),
        ref,
        user.email,
        dto.amount,
      );

      return {
        success: true,
        referenceNumber: ref,
        receiptUrl,
        note: 'ACH transfer is processing. Funds typically settle within 1–2 business days.',
      };

    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ── ACH Auto-Settlement (private) ────────────────────────────
  // Schedules a setTimeout that marks the transaction as completed.
  // Min: 5 hours, Max: 48 hours, randomised so it feels real.
  private scheduleAchSettlement(
    txId:    string,
    ref:     string,
    email:   string,
    amount:  number,
  ): void {
    // Random delay between 5 hours and 48 hours in milliseconds
    const MIN_MS = 5  * 60 * 60 * 1000;   // 5 hours
    const MAX_MS = 48 * 60 * 60 * 1000;   // 48 hours
    const delayMs = Math.floor(Math.random() * (MAX_MS - MIN_MS + 1)) + MIN_MS;

    // Log the scheduled time for observability
    const settlesAt = new Date(Date.now() + delayMs);
    console.log(
      `[ACH] ${ref} scheduled to settle at ${settlesAt.toISOString()} ` +
      `(in ${(delayMs / 3600000).toFixed(1)}h)`,
    );

    // Fire-and-forget: setTimeout runs in Node's event loop
    // The process must stay running for this to fire (it will in prod)
    setTimeout(async () => {
      try {
        const updated = await this.transactionModel.findByIdAndUpdate(
          txId,
          {
            status:      TransactionStatus.COMPLETED,
            processedAt: new Date(),
          },
          { new: true },
        );

        if (!updated) {
          console.warn(`[ACH] Settlement skipped — tx ${txId} not found`);
          return;
        }

        console.log(`[ACH] ${ref} settled successfully`);

        // Notify user that funds have been sent
        this.notificationsService.sendTransferAlert(email, {
          direction: 'debit',
          amount,
          fee:       0,
          ref,
          type:      'interbank_transfer',
          balance:   updated.balanceAfter ?? 0,
          description: `ACH transfer ${ref} has completed successfully.`,
        }).catch(() => null);

      } catch (err) {
        console.error(`[ACH] Settlement failed for ${ref}:`, err);
      }
    }, delayMs);
  }

  // ── Confirm International Wire ────────────────────────────────
  async confirmInternational(userId: string, dto: {
    fromAccountId:    string;
    recipientName:    string;
    recipientBank:    string;
    swiftCode:        string;
    ibanNumber:       string;
    recipientCountry: string;
    amount:           number;
    currency:         string;
    description?:     string;
    securityPin:      string;
    otp:              string;
    userTimezone?:    string;
  }, user: any) {
    this.otpService.verify(this.otpService.buildKey(userId, 'transfer_confirmation'), dto.otp);
    await this.verifySecurityPin(userId, dto.securityPin);

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const sender = await this.accountModel
        .findOne({ _id: new Types.ObjectId(dto.fromAccountId), userId: new Types.ObjectId(userId) })
        .session(session);
      if (!sender) throw new NotFoundException('Account not found');

      const fee   = Math.min(dto.amount * 0.02, 50);
      const total = dto.amount + fee;
      if (sender.availableBalance < total) throw new BadRequestException('Insufficient funds');

      sender.balance          -= total;
      sender.availableBalance -= total;
      sender.totalWithdrawn   += total;
      await sender.save({ session });

      const ref  = generateReference('WIRE');
      const [tx] = await this.transactionModel.create([{
        userId:              new Types.ObjectId(userId),
        accountId:           sender._id,
        referenceNumber:     ref,
        type:                TransactionType.INTERNATIONAL_TRANSFER,
        status:              TransactionStatus.PROCESSING,
        direction:           TransactionDirection.DEBIT,
        amount:              dto.amount,
        fee,
        currency:            dto.currency || 'USD',
        description:         dto.description ?? 'International Wire Transfer',
        senderAccountNumber: sender.accountNumber,
        recipientName:       dto.recipientName,
        recipientBankName:   dto.recipientBank,
        recipientCountry:    dto.recipientCountry,
        swiftCode:           dto.swiftCode,
        ibanNumber:          dto.ibanNumber,
        balanceAfter:        sender.balance,
      }], { session });

      await session.commitTransaction();
      this.logger.log(`[TRANSFERS] International committed — ref: ${ref}, tx._id: ${(tx as any)._id}`);

      // Generate receipt and save URL back to DB
      this.logger.log(`[TRANSFERS] Generating receipt for ${ref}...`);
      const receiptUrl = await this.receiptsService
        .generatePdfReceipt(tx, dto.userTimezone)
        .catch((err: any) => {
          this.logger.error(`[TRANSFERS] Receipt generation failed for ${ref}: ${err?.message ?? err}`);
          return '';
        });

      this.logger.log(`[TRANSFERS] Receipt result for ${ref}: "${receiptUrl || 'EMPTY/FAILED'}"`);

      if (receiptUrl) {
        await this.transactionModel.findByIdAndUpdate(
          (tx as any)._id,
          { receiptUrl },
        );
        this.logger.log(`[TRANSFERS] receiptUrl saved to DB for tx ${(tx as any)._id}`);
      } else {
        this.logger.warn(`[TRANSFERS] No receiptUrl for ${ref} — skipping DB save`);
      }

      this.notificationsService.sendTransferAlert(user.email, {
        direction:        'debit',
        amount:           dto.amount,
        fee,
        ref,
        type:             'international_transfer',
        balance:          sender.balance,
        recipientName:    dto.recipientName,
        recipientBankName:dto.recipientBank,
        recipientCountry: dto.recipientCountry,
      }).catch(() => null);

      return {
        success:         true,
        referenceNumber: ref,
        receiptUrl,
        note:            'International wires process in 2–5 business days.',
      };

    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }
}
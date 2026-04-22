import {
  Injectable, NotFoundException, BadRequestException, InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { Readable } from 'stream';
import { ConfigService } from '@nestjs/config';
import { ChequeDeposit, ChequeDepositDocument, ChequeStatus } from './schemas/cheque-deposit.schema';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import { Transaction, TransactionDocument, TransactionType, TransactionStatus, TransactionDirection } from '../transactions/schemas/transaction.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { generateReference } from '../../common/utils/generate-ref.util';

@Injectable()
export class ChequeDepositService {
  constructor(
    @InjectModel(ChequeDeposit.name) private chequeModel:  Model<ChequeDepositDocument>,
    @InjectModel(Account.name)       private accountModel: Model<AccountDocument>,
    @InjectModel(Transaction.name)   private txModel:      Model<TransactionDocument>,
    private readonly config:               ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    cloudinary.config({
      cloud_name: config.get('CLOUDINARY_CLOUD_NAME'),
      api_key:    config.get('CLOUDINARY_API_KEY'),
      api_secret: config.get('CLOUDINARY_API_SECRET'),
    });
  }

  async depositCheque(
    userId: string,
    dto: {
      accountId:    string;
      chequeNumber: string;
      payerName:    string;
      payerBank:    string;
      amount:       number;
      memo:         string;
    },
    files: { front: Express.Multer.File; back?: Express.Multer.File },
    user: any,
  ) {
    const account = await this.accountModel.findOne({
      _id: new Types.ObjectId(dto.accountId), userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');

    // Check for duplicate cheque number
    const duplicate = await this.chequeModel.findOne({
      userId:       new Types.ObjectId(userId),
      chequeNumber: dto.chequeNumber,
      status:       { $nin: [ChequeStatus.REJECTED] },
    });
    if (duplicate) throw new BadRequestException('This cheque has already been deposited');

    const ref = generateReference('CHQ');

    // Upload cheque images to Cloudinary
    const [frontUrl, frontId] = await this.uploadChequeImage(
      files.front, `nexabank/cheques/${userId}/${ref}-front`,
    );
    let backUrl = '';
    let backId  = '';
    if (files.back) {
      [backUrl, backId] = await this.uploadChequeImage(
        files.back, `nexabank/cheques/${userId}/${ref}-back`,
      );
    }

    // Funds available in 1 business day for amounts under $5,500, 2 days otherwise
    const availabilityDays  = dto.amount <= 5500 ? 1 : 2;
    const fundsAvailableAt  = new Date(Date.now() + availabilityDays * 24 * 60 * 60 * 1000);

    const cheque = await this.chequeModel.create({
      userId:            new Types.ObjectId(userId),
      accountId:         account._id,
      chequeNumber:      dto.chequeNumber,
      payerName:         dto.payerName,
      payerBank:         dto.payerBank,
      amount:            dto.amount,
      memo:              dto.memo,
      frontImageUrl:     frontUrl,
      frontImagePublicId: frontId,
      backImageUrl:      backUrl,
      backImagePublicId: backId,
      status:            ChequeStatus.SUBMITTED,
      referenceNumber:   ref,
      availabilityDays,
      fundsAvailableAt,
    });

    // Add to pending balance (not available yet)
    account.pendingBalance += dto.amount;
    await account.save();

    // Record as pending transaction
    await this.txModel.create({
      userId:    new Types.ObjectId(userId),
      accountId: account._id,
      referenceNumber: ref,
      type:      TransactionType.CHEQUE_DEPOSIT,
      status:    TransactionStatus.PENDING,
      direction: TransactionDirection.CREDIT,
      amount:    dto.amount,
      fee:       0,
      currency:  'USD',
      description: `Cheque Deposit — #${dto.chequeNumber} from ${dto.payerName}`,
      senderName: dto.payerName,
      senderBankName: dto.payerBank,
      balanceAfter: account.balance,
      metadata:  { chequeNumber: dto.chequeNumber, availabilityDays, fundsAvailableAt },
    });

    // Notify user
    await this.notificationsService.sendOtpEmail(
      user.email,
      '',
      'email_verification', // reuse template as deposit confirmation
    );

    return {
      success:     true,
      referenceNumber: ref,
      cheque,
      message:     `Cheque submitted. Funds of $${dto.amount} will be available in ${availabilityDays} business day(s).`,
      fundsAvailableAt,
    };
  }

  async getChequeHistory(userId: string) {
    return this.chequeModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getChequeById(chequeId: string, userId: string) {
    const cheque = await this.chequeModel.findOne({
      _id:    new Types.ObjectId(chequeId),
      userId: new Types.ObjectId(userId),
    });
    if (!cheque) throw new NotFoundException('Cheque deposit not found');
    return cheque;
  }

  private uploadChequeImage(
    file:     Express.Multer.File,
    publicId: string,
  ): Promise<[string, string]> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'nexabank/cheques', public_id: publicId, resource_type: 'image' },
        (err: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (err)     return reject(err);
          if (!result) return reject(new InternalServerErrorException('Cloudinary upload failed'));
          resolve([result.secure_url, result.public_id]);
        },
      );
      Readable.from(file.buffer).pipe(stream);
    });
  }
}

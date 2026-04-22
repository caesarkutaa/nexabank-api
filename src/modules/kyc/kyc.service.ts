import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { Kyc, KycDocument } from './schemas/kyc.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class KycService {
  constructor(
    @InjectModel(Kyc.name)  private kycModel:  Model<KycDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private config: ConfigService,
  ) {
    cloudinary.config({
      cloud_name: config.get('CLOUDINARY_CLOUD_NAME'),
      api_key:    config.get('CLOUDINARY_API_KEY'),
      api_secret: config.get('CLOUDINARY_API_SECRET'),
    });
  }

  async getKycStatus(userId: string) {
    const kyc = await this.kycModel.findOne({ userId: new Types.ObjectId(userId) }).lean();
    return kyc ?? { status: 'not_started', userId };
  }

  async submitKyc(userId: string, dto: {
    documentType:   string;
    documentNumber: string;
    expiryDate?:    string;
  }, files: { front?: Express.Multer.File[]; back?: Express.Multer.File[]; selfie?: Express.Multer.File[] }) {
    const existing = await this.kycModel.findOne({ userId: new Types.ObjectId(userId) });
    if (existing?.status === 'approved') throw new BadRequestException('KYC already approved');

    const [frontUrl, frontId]   = files.front?.[0]  ? await this.uploadFile(files.front[0],  `kyc/${userId}/front`)  : [];
    const [backUrl, backId]     = files.back?.[0]   ? await this.uploadFile(files.back[0],   `kyc/${userId}/back`)   : [];
    const [selfieUrl, selfieId] = files.selfie?.[0] ? await this.uploadFile(files.selfie[0], `kyc/${userId}/selfie`) : [];

    const kycData = {
      userId:                new Types.ObjectId(userId),
      documentType:          dto.documentType,
      documentNumber:        dto.documentNumber,
      expiryDate:            dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      status:                'pending',
      documentFrontUrl:      frontUrl,
      documentFrontPublicId: frontId,
      documentBackUrl:       backUrl,
      documentBackPublicId:  backId,
      selfieUrl,
      selfiePublicId:        selfieId,
    };

    const kyc = existing
      ? await this.kycModel.findByIdAndUpdate(existing._id, kycData, { new: true })
      : await this.kycModel.create(kycData);

    await this.userModel.findByIdAndUpdate(userId, { kycStatus: 'pending' });
    return { message: 'KYC submitted successfully. Review takes 1–2 business days.', kyc };
  }

  private uploadFile(file: Express.Multer.File, publicId: string): Promise<[string, string]> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'nexabank/kyc', public_id: publicId, resource_type: 'image' },
        (
                 err:    UploadApiErrorResponse | undefined,
                 result: UploadApiResponse    | undefined,
               ) => {
                 if (err)     return reject(err);
                 if (!result) return reject(new InternalServerErrorException('Cloudinary upload failed'));
                 resolve([result.secure_url, result.public_id]);
               },
      );
      Readable.from(file.buffer).pipe(stream);
    });
  }
}
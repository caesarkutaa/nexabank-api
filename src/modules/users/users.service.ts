import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private config: ConfigService,
  ) {
    cloudinary.config({
      cloud_name: config.get('CLOUDINARY_CLOUD_NAME'),
      api_key:    config.get('CLOUDINARY_API_KEY'),
      api_secret: config.get('CLOUDINARY_API_SECRET'),
    });
  }

  async getProfile(userId: string) {
    const user = await this.userModel.findById(userId)
      .select('-passwordHash -refreshTokenHash -twoFactorSecret -securityPinHash');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: Partial<{
    firstName: string; lastName: string; phoneNumber: string;
    address: string; city: string; state: string; zipCode: string;
  }>) {
    const user = await this.userModel.findByIdAndUpdate(userId, dto, { new: true })
      .select('-passwordHash -refreshTokenHash -twoFactorSecret -securityPinHash');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async uploadProfilePicture(userId: string, file: Express.Multer.File) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Delete old picture
    if (user.profilePicturePublicId) {
      await cloudinary.uploader.destroy(user.profilePicturePublicId).catch(() => null);
    }

    const [url, publicId] = await this.uploadToCloudinary(file, `nexabank/profiles/${userId}`);
    await this.userModel.findByIdAndUpdate(userId, { profilePictureUrl: url, profilePicturePublicId: publicId });
    return { profilePictureUrl: url };
  }

   private uploadToCloudinary(
    file:     Express.Multer.File,
    publicId: string,
  ): Promise<[string, string]> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder:         'nexabank',
          public_id:      publicId,
          resource_type:  'image',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          ],
        },
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
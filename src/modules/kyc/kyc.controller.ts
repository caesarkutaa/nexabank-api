import {
  Controller, Get, Post, Body, UseGuards,
  UseInterceptors, UploadedFiles, BadRequestException,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import * as userSchema from '../users/schemas/user.schema';
import { KycService } from './kyc.service';

@ApiTags('KYC')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get KYC verification status' })
  status(@CurrentUser() user: userSchema.UserDocument) {
    return this.kycService.getKycStatus(String(user._id));
  }

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Submit KYC documents (front, back, selfie)' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'front',  maxCount: 1 },
        { name: 'back',   maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
      ],
      {
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
          if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
            return cb(new BadRequestException('Only image files allowed'), false);
          }
          cb(null, true);
        },
      },
    ),
  )
  async submit(
    @CurrentUser() user: userSchema.UserDocument,
    @Body() body: {
      documentType:   string;
      documentNumber: string;
      expiryDate?:    string;
    },
    @UploadedFiles()
    files: {
      front?:  Express.Multer.File[];
      back?:   Express.Multer.File[];
      selfie?: Express.Multer.File[];
    },
  ) {
    if (!files?.front?.[0])  throw new BadRequestException('Front image is required');
    if (!files?.selfie?.[0]) throw new BadRequestException('Selfie image is required');

    return this.kycService.submitKyc(String(user._id), body, files);
  }
}
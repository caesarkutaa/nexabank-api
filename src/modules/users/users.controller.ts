import {
  Controller, Get, Patch, Post, Body,
  UseGuards, UseInterceptors, UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import * as userSchema from './schemas/user.schema';
import { UsersService } from './users.service';

@ApiTags('Users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser() user: userSchema.UserDocument) {
    return this.usersService.getProfile(String(user._id));
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update profile details' })
  updateProfile(
    @CurrentUser() user: userSchema.UserDocument,
    @Body() dto: Partial<{
      firstName:   string;
      lastName:    string;
      phoneNumber: string;
      address:     string;
      city:        string;
      state:       string;
      zipCode:     string;
    }>,
  ) {
    return this.usersService.updateProfile(String(user._id), dto);
  }

  @Post('profile/picture')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload profile picture to Cloudinary' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadPicture(
    @CurrentUser() user: userSchema.UserDocument,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Image file is required');
    return this.usersService.uploadProfilePicture(String(user._id), file);
  }
}
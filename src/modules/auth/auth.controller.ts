// src/modules/auth/auth.controller.ts
import {
  Controller, Post, Body, UseGuards, Request,
  HttpCode, HttpStatus, Ip,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import { OtpService } from '../otp/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { UserDocument } from '../users/schemas/user.schema'; 

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService:          AuthService,
    private readonly otpService:           OtpService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post('register')
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Register a new user account' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('captcha/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a captcha code' })
  captcha() {
    return this.authService.generateCaptcha();
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @UseGuards(AuthGuard('local'))
  @ApiOperation({ summary: 'Login — username + password + captcha' })
  login(@Request() req: { user: UserDocument }, @Ip() ip: string) { // ← typed
    return this.authService.login(req.user, ip);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with OTP' })
  verifyEmail(@Body() body: { userId: string; otp: string }) {
    return this.authService.verifyEmail(body.userId, body.otp);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification OTP' })
  async resendOtp(@Body() body: { userId: string; email: string }) {
    const otp = this.otpService.generate();
    this.otpService.save(
      this.otpService.buildKey(body.userId, 'email_verification'),
      otp,
    );
    await this.notificationsService.sendOtpEmail(body.email, otp, 'email_verification');
    return { message: 'OTP resent. Check your email.' };
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Generate 2FA secret & QR code' })
  setup2FA(@CurrentUser() user: UserDocument) { // ← typed
    return this.authService.setup2FA(String(user._id));
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Enable 2FA after scanning QR code' })
  enable2FA(
    @CurrentUser() user: UserDocument, // ← typed
    @Body() body: { token: string },
  ) {
    return this.authService.enable2FA(String(user._id), body.token);
  }

  @Post('2fa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Verify 2FA token on login' })
  verify2FA(
    @CurrentUser() user: UserDocument, // ← typed
    @Body() body: { token: string },
  ) {
    return this.authService.verify2FA(String(user._id), body.token);
  }

  @Post('security-pin/set')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Set 6-digit security PIN' })
  setPin(
    @CurrentUser() user: UserDocument, // ← typed
    @Body() body: { pin: string },
  ) {
    return this.authService.setSecurityPin(String(user._id), body.pin);
  }

  @Post('security-pin/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Verify security PIN before sensitive operations' })
  verifyPin(
    @CurrentUser() user: UserDocument, // ← typed
    @Body() body: { pin: string },
  ) {
    return this.authService.verifySecurityPin(String(user._id), body.pin);
  }
}
// src/modules/auth/auth.controller.ts
import {
  Controller, Post, Body, UseGuards, Request,
  HttpCode, HttpStatus, Ip,
  Patch,
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
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';


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


  // ── Register Admin ────────────────────────────────────────────
  @Post('register/admin')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { ttl: 60000, limit: 2 } })
  @ApiOperation({ summary: 'Register a new admin account (requires ADMIN_SECRET_KEY)' })
  registerAdmin(@Body() dto: RegisterAdminDto, @Ip() ip: string) {
    return this.authService.registerAdmin(dto, ip);
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

 // ── Forgot Password ───────────────────────────────────────────
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Request a password reset OTP via email' })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Ip() ip: string) {
    return this.authService.forgotPassword(dto, ip);
  }

  // ── Verify Rseset OTP ──────────────────────────────────────────
  @Post('forgot-password/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the password reset OTP — returns a resetToken' })
  verifyResetOtp(@Body() body: { email: string; otp: string }) {
    return this.authService.verifyResetOtp(body.email, body.otp);
  }

  // ── Reset Password ────────────────────────────────────────────
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Reset password using email + OTP + new password' })
  resetPassword(@Body() dto: ResetPasswordDto, @Ip() ip: string) {
    return this.authService.resetPassword(dto, ip);
  }

  // ── Change Password (authenticated) ──────────────────────────
  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Change password while logged in (requires current password)' })
  changePassword(
    @CurrentUser() user: UserDocument,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(String(user._id), dto);
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
import {
  Controller, Post, Get, Body, UseGuards, Request,
  HttpCode, HttpStatus, Ip, Patch, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';        
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import { OtpService } from '../otp/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { UserDocument } from '../users/schemas/user.schema';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { AdminLoginDto } from  './dto/Admin login.dto';            

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService:          AuthService,
    private readonly otpService:           OtpService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ══════════════════════════════════════════════════════════════
  // USER AUTH
  // ══════════════════════════════════════════════════════════════

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
  @ApiOperation({ summary: 'User login — username + password' })
  login(@Request() req: { user: UserDocument }, @Ip() ip: string) {
    return this.authService.login(req.user, ip);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with OTP' })
  verifyEmail(@Body() body: VerifyEmailDto) {
    if (!body.userId || body.userId.trim() === '') {
      throw new BadRequestException('userId is required');
    }
    if (!body.otp || body.otp.trim() === '') {
      throw new BadRequestException('otp is required');
    }
    return this.authService.verifyEmail(body.userId.trim(), body.otp.trim());
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification OTP' })
  async resendOtp(@Body() body: { userId: string; email: string }) {
    if (!body.userId || body.userId.trim() === '') {
      throw new BadRequestException('userId is required');
    }
    if (!body.email || body.email.trim() === '') {
      throw new BadRequestException('email is required');
    }

    const otp = this.otpService.generate();
    this.otpService.save(
      this.otpService.buildKey(body.userId.trim(), 'email_verification'),
      otp,
    );
    await this.notificationsService.sendOtpEmail(
      body.email.trim(),
      otp,
      'email_verification',
    );
    return { message: 'OTP resent successfully. Check your email.' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Request a password reset OTP via email' })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Ip() ip: string) {
    return this.authService.forgotPassword(dto, ip);
  }

  @Post('forgot-password/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the password reset OTP' })
  verifyResetOtp(@Body() body: { email: string; otp: string }) {
    return this.authService.verifyResetOtp(body.email, body.otp);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Reset password using email + OTP + new password' })
  resetPassword(@Body() dto: ResetPasswordDto, @Ip() ip: string) {
    return this.authService.resetPassword(dto, ip);
  }

  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Change password while logged in' })
  changePassword(@CurrentUser() user: UserDocument, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(String(user._id), dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout — invalidates refresh token' })
  logout(@CurrentUser() user: UserDocument) {
    return this.authService.logout(String(user._id));
  }

  // ── 2FA ───────────────────────────────────────────────────────

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Generate 2FA secret & QR code' })
  setup2FA(@CurrentUser() user: UserDocument) {
    return this.authService.setup2FA(String(user._id));
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Enable 2FA after scanning QR code' })
  enable2FA(@CurrentUser() user: UserDocument, @Body() body: { token: string }) {
    return this.authService.enable2FA(String(user._id), body.token);
  }

  @Post('2fa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Verify 2FA token on login' })
  verify2FA(@CurrentUser() user: UserDocument, @Body() body: { token: string }) {
    return this.authService.verify2FA(String(user._id), body.token);
  }

  // ── Security PIN ──────────────────────────────────────────────

  @Post('security-pin/set')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Set 6-digit security PIN' })
  setPin(@CurrentUser() user: UserDocument, @Body() body: { pin: string }) {
    return this.authService.setSecurityPin(String(user._id), body.pin);
  }

  @Post('security-pin/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Verify security PIN before sensitive operations' })
  verifyPin(@CurrentUser() user: UserDocument, @Body() body: { pin: string }) {
    return this.authService.verifySecurityPin(String(user._id), body.pin);
  }

  // ══════════════════════════════════════════════════════════════
  // ADMIN AUTH  —  completely separate from user login flow
  // ══════════════════════════════════════════════════════════════
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Admin portal login — role-restricted, uses identifier field' })
  adminLogin(@Body() dto: AdminLoginDto, @Ip() ip: string) {
    return this.authService.adminLogin(dto, ip);
  }

  
  @Post('admin/logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Admin logout — invalidates refresh token' })
  adminLogout(@CurrentUser() admin: UserDocument) {
    return this.authService.logout(String(admin._id)); // reuse same logout logic
  }


  @Get('admin/me')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get authenticated admin profile' })
  adminMe(@CurrentUser() admin: UserDocument) {
    return this.authService.getAdminProfile(String(admin._id));
  }
}
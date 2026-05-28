import {
  Injectable, UnauthorizedException, BadRequestException,
  ConflictException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { User, UserDocument, UserRole, UserStatus } from '../users/schemas/user.schema';
import { OtpService } from '../otp/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AdminLoginDto } from './dto/Admin login.dto';   
import { PasswordReset, PasswordResetDocument } from './schemas/password-reset.schema';

@Injectable()
export class AuthService {
  verifyResetOtp(email: string, otp: string) {
    throw new Error('Method not implemented.');
  }

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PasswordReset.name)
    private readonly resetModel: Model<PasswordResetDocument>,
    private jwtService:           JwtService,
    private config:               ConfigService,
    private otpService:           OtpService,
    private notificationsService: NotificationsService,
  ) {}

  // ── Register ─────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const exists = await this.userModel.findOne({
      $or: [
        { email:    dto.email.toLowerCase()    },
        { username: dto.username.toLowerCase() },
      ],
    });
    if (exists) throw new ConflictException('Email or username already registered');

    const rounds = parseInt(this.config.get<string>('BCRYPT_ROUNDS', '12'), 10);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.userModel.create({
      ...dto,
      passwordHash,
      status: UserStatus.PENDING,
    });

    const userId = String(user._id);

    const otp = this.otpService.generate();
    const key = this.otpService.buildKey(userId, 'email_verification');
    this.otpService.save(key, otp);

    await this.notificationsService.sendOtpEmail(user.email, otp, 'email_verification');
    await this.notificationsService.sendWelcomeEmail(
      user.email,
      user.firstName || user.username,
    );

    return {
      message: 'Registration successful. Check your email to verify your account.',
      userId,
      email:   user.email,
    };
  }

  // ── Register Admin ────────────────────────────────────────────
  async registerAdmin(dto: RegisterAdminDto, ip: string) {
    const secretKey = this.config.get<string>('ADMIN_SECRET_KEY');
    if (!secretKey || dto.adminSecretKey !== secretKey) {
      throw new ForbiddenException('Invalid admin registration key');
    }

    const exists = await this.userModel.findOne({
      $or: [{ email: dto.email.toLowerCase() }, { username: dto.username.toLowerCase() }],
    });
    if (exists) throw new ConflictException('Email or username already registered');

    const rounds = parseInt(this.config.get<string>('BCRYPT_ROUNDS', '12'), 10);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const admin = await this.userModel.create({
      username:      dto.username.toLowerCase(),
      email:         dto.email.toLowerCase(),
      passwordHash,
      firstName:     dto.firstName,
      lastName:      dto.lastName,
      phoneNumber:   dto.phoneNumber,
      role:          UserRole.ADMIN,
      status:        UserStatus.ACTIVE,
      emailVerified: true,
      kycStatus:     'approved',
    });

    await this.notificationsService.sendAdminWelcomeEmail(
      admin.email,
      admin.firstName,
      dto.username,
    );

    return {
      message:  'Admin account created successfully.',
      adminId:  String(admin._id),
      username: admin.username,
      email:    admin.email,
      role:     admin.role,
    };
  }

  // ── Validate (used by LocalStrategy) ─────────────────────────
  async validateUser(username: string, password: string): Promise<UserDocument> {
    const user = await this.userModel
      .findOne({ $or: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }] })
      .select('+passwordHash +securityPinHash');

    if (!user) throw new UnauthorizedException('Invalid username or password');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(`Account locked. Try again in ${mins} minute(s).`);
    }

    if (user.status === UserStatus.SUSPENDED)
      throw new ForbiddenException('Account suspended. Contact support@nexabank.com');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.recordFailedLogin(user);
      throw new UnauthorizedException('Invalid username or password');
    }

    await this.userModel.findByIdAndUpdate(user._id, { failedLoginAttempts: 0, lockedUntil: null });
    return user;
  }

  // ── Login ─────────────────────────────────────────────────────
  async login(user: UserDocument, ip: string) {
    const payload      = { sub: user._id, username: user.username, role: user.role };
    const accessToken  = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret:    this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'),
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.userModel.findByIdAndUpdate(user._id, {
      refreshTokenHash,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    });

    if (user.twoFactorEnabled) {
      return { requiresTwoFactor: true, userId: user._id };
    }

    return {
      accessToken,
      refreshToken,
      requiresTwoFactor: false,
      user: { id: user._id, username: user.username, email: user.email, role: user.role },
    };
  }

  // ── Admin Login ───────────────────────────────────────────────
  // Separate from the user login flow. Uses its own endpoint
  // POST /auth/admin/login, enforces role = admin | super_admin,
  // and issues the same JWT shape so AdminGuard works transparently.
  async adminLogin(dto: AdminLoginDto, ip: string) {
    // 1. Find by email OR username
    const user = await this.userModel
      .findOne({
        $or: [
          { email:    dto.identifier.toLowerCase() },
          { username: dto.identifier.toLowerCase() },
        ],
      })
      .select('+passwordHash');

    if (!user) throw new UnauthorizedException('Invalid credentials');

    // 2. Enforce admin role — reject regular users immediately
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Access denied. This portal is for administrators only.',
      );
    }

    // 3. Account status check
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Admin account suspended. Contact the system administrator.',
      );
    }

    // 4. Lockout check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(`Account locked. Try again in ${mins} minute(s).`);
    }

    // 5. Password verification
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.recordFailedLogin(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    // 6. Reset failed attempts on success
    await this.userModel.findByIdAndUpdate(user._id, {
      failedLoginAttempts: 0,
      lockedUntil:         null,
      lastLoginAt:         new Date(),
      lastLoginIp:         ip,
    });

    // 7. Issue tokens — same payload as user login so AdminGuard works
    const payload      = { sub: user._id, username: user.username, role: user.role };
    const accessToken  = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret:    this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'),
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.userModel.findByIdAndUpdate(user._id, { refreshTokenHash });

    return {
      accessToken,
      refreshToken,
      user: {
        id:        String(user._id),
        username:  user.username,
        email:     user.email,
        firstName: user.firstName,
        lastName:  user.lastName,
        role:      user.role,
      },
    };
  }

  // ── Admin Profile ─────────────────────────────────────────────
  // Called by GET /auth/admin/me from the admin layout on mount.
  async getAdminProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-passwordHash -refreshTokenHash -twoFactorSecret -securityPinHash');
    if (!user) throw new NotFoundException('Admin not found');
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Access denied');
    }
    return user;
  }

  async getMe(userId: string) {
  const user = await this.userModel
    .findById(userId)
    .select('-passwordHash -refreshTokenHash -twoFactorSecret -securityPinHash')
    .lean();
  if (!user) throw new NotFoundException('User not found');
  return user;
}

  // ── Logout ────────────────────────────────────────────────────
  async logout(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { refreshTokenHash: null });
    return { message: 'Logged out successfully' };
  }

  // ── Forgot Password ───────────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto, ip: string) {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() });

    const genericResponse = {
      message: 'If an account with that email exists, a reset code has been sent.',
    };

    if (!user) return genericResponse;
    if (user.status === UserStatus.SUSPENDED) return genericResponse;

    await this.resetModel.updateMany(
      { userId: user._id, used: false },
      { used: true },
    );

    const otp       = this.otpService.generate();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const tokenHash = await bcrypt.hash(otp, 10);

    await this.resetModel.create({
      userId:    user._id,
      token:     tokenHash,
      expiresAt,
      ipAddress: ip,
      used:      false,
    });

    await this.notificationsService.sendPasswordResetEmail(
      user.email,
      user.firstName || user.username,
      otp,
    );

    return genericResponse;
  }

  // ── Reset Password ────────────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto, ip: string) {
    if (dto.newPassword !== dto.confirmPassword)
      throw new BadRequestException('Passwords do not match');

    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (!user) throw new BadRequestException('Invalid request');

    const resetRecord = await this.resetModel.findOne({
      userId:    user._id,
      used:      false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!resetRecord) throw new BadRequestException('Reset code expired. Request a new one.');

    const isValid = await bcrypt.compare(dto.otp, resetRecord.token);
    if (!isValid) throw new BadRequestException('Invalid reset code');

    const isSame = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (isSame) throw new BadRequestException('New password cannot be the same as your current password');

    const rounds       = this.config.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await bcrypt.hash(dto.newPassword, rounds);

    await this.userModel.findByIdAndUpdate(user._id, {
      passwordHash,
      refreshTokenHash:    null,
      failedLoginAttempts: 0,
      lockedUntil:         null,
      status:              UserStatus.ACTIVE,
    });

    await this.resetModel.findByIdAndUpdate(resetRecord._id, { used: true });

    await this.notificationsService.sendPasswordChangedEmail(
      user.email,
      user.firstName || user.username,
      ip,
    );

    return { message: 'Password reset successfully. Please login with your new password.' };
  }

  // ── Change Password (logged in) ───────────────────────────────
  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword)
      throw new BadRequestException('Passwords do not match');

    const user = await this.userModel.findById(userId).select('+passwordHash');
    if (!user) throw new NotFoundException('User not found');

    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentValid) throw new UnauthorizedException('Current password is incorrect');

    const isSame = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (isSame) throw new BadRequestException('New password cannot be the same as your current password');

    const rounds = parseInt(this.config.get<string>('BCRYPT_ROUNDS', '12'), 10);
    const passwordHash = await bcrypt.hash(dto.newPassword, rounds);

    await this.userModel.findByIdAndUpdate(userId, {
      passwordHash,
      refreshTokenHash: null,
    });

    return { message: 'Password changed successfully. Please login again.' };
  }

  // ── Verify Captcha ────────────────────────────────────────────
  verifyCaptcha(submitted: string, sessionCode: string): boolean {
    if (submitted.toUpperCase() !== sessionCode.toUpperCase())
      throw new BadRequestException('Captcha verification failed. Please try again.');
    return true;
  }

  generateCaptcha(): { code: string } {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code  = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return { code };
  }

  // ── 2FA Setup ─────────────────────────────────────────────────
  async setup2FA(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const issuer = this.config.get<string>('TWO_FA_ISSUER', 'NexaBank');

    const secret = speakeasy.generateSecret({
      name:   `${issuer}:${user.email}`,
      length: 32,
    });

    const otpauthUrl =
      secret.otpauth_url ??
      `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user.email)}?secret=${secret.base32}&issuer=${encodeURIComponent(issuer)}`;

    await this.userModel.findByIdAndUpdate(userId, { twoFactorSecret: secret.base32 });

    const qrCode = await qrcode.toDataURL(otpauthUrl);

    return { secret: secret.base32, qrCode, otpauthUrl };
  }

  async enable2FA(userId: string, token: string) {
    const user = await this.userModel.findById(userId).select('+twoFactorSecret');
    if (!user?.twoFactorSecret) throw new BadRequestException('Run 2FA setup first');

    const ok = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token, window: 1 });
    if (!ok) throw new UnauthorizedException('Invalid 2FA token');

    await this.userModel.findByIdAndUpdate(userId, { twoFactorEnabled: true });
    return { message: '2FA enabled successfully' };
  }

  async verify2FA(userId: string, token: string) {
    const user = await this.userModel.findById(userId).select('+twoFactorSecret');
    if (!user?.twoFactorEnabled) throw new BadRequestException('2FA is not enabled');

    const ok = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token, window: 1 });
    if (!ok) throw new UnauthorizedException('Invalid 2FA code');
    return { verified: true };
  }

  // ── Security PIN ──────────────────────────────────────────────
  async setSecurityPin(userId: string, pin: string, confirmPin?: string) {
  if (!/^\d{6}$/.test(pin))
    throw new BadRequestException('PIN must be exactly 6 digits');
  if (confirmPin !== undefined && pin !== confirmPin)
    throw new BadRequestException('PINs do not match');
 
  const pinHash = await bcrypt.hash(pin, 10);
  await this.userModel.findByIdAndUpdate(userId, {
    securityPinHash: pinHash,
    hasPinSet:       true,       // ← marks setup as complete
  });
  return { message: 'Security PIN set successfully' };
}

  async verifySecurityPin(userId: string, pin: string): Promise<boolean> {
    const user = await this.userModel.findById(userId).select('+securityPinHash');
    if (!user?.securityPinHash) throw new BadRequestException('Security PIN not set');
    const ok = await bcrypt.compare(pin, user.securityPinHash);
    if (!ok) throw new UnauthorizedException('Incorrect security PIN');
    return true;
  }

  // ── Email Verification ────────────────────────────────────────
  async verifyEmail(userId: string, otp: string) {
    if (!userId || userId.trim() === '') {
      throw new BadRequestException('userId is required');
    }

    const key = this.otpService.buildKey(userId.trim(), 'email_verification');
    this.otpService.verify(key, otp);

    await this.userModel.findByIdAndUpdate(userId.trim(), {
      emailVerified: true,
      status:        UserStatus.ACTIVE,
    });

    return { message: 'Email verified successfully. Your account is now active.' };
  }

  // ── Private: Failed Login Handler ─────────────────────────────
  private async recordFailedLogin(user: UserDocument) {
    const max      = this.config.get<number>('MAX_LOGIN_ATTEMPTS', 5);
    const lockMins = this.config.get<number>('LOCKOUT_DURATION_MINUTES', 30);
    const attempts = (user.failedLoginAttempts || 0) + 1;

    const update: any = { failedLoginAttempts: attempts };
    if (attempts >= max) update.lockedUntil = new Date(Date.now() + lockMins * 60 * 1000);
    await this.userModel.findByIdAndUpdate(user._id, update);
  }
}
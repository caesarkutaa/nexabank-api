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
import { User, UserDocument, UserStatus } from '../users/schemas/user.schema';
import { OtpService } from '../otp/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService:           JwtService,
    private config:               ConfigService,
    private otpService:           OtpService,
    private notificationsService: NotificationsService,
  ) {}

  // ── Register ─────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const exists = await this.userModel.findOne({
      $or: [{ email: dto.email.toLowerCase() }, { username: dto.username.toLowerCase() }],
    });
    if (exists) throw new ConflictException('Email or username already registered');

    const rounds = parseInt(this.config.get<string>('BCRYPT_ROUNDS', '12'), 10);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.userModel.create({ ...dto, passwordHash, status: UserStatus.PENDING });

    // Send email verification OTP
    const otp = this.otpService.generate();
    this.otpService.save(this.otpService.buildKey(String(user._id), 'email_verification'), otp);
    await this.notificationsService.sendOtpEmail(user.email, otp, 'email_verification');
    await this.notificationsService.sendWelcomeEmail(user.email, user.firstName || user.username);

    return { message: 'Registration successful. Check your email to verify your account.' };
  }

  // ── Validate (used by LocalStrategy) ─────────────────────────
  async validateUser(username: string, password: string): Promise<UserDocument> {
    const user = await this.userModel
      .findOne({ $or: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }] })
      .select('+passwordHash +securityPinHash');

    if (!user) throw new UnauthorizedException('Invalid username or password');

    // Lockout check
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

    // Reset failed attempts
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

    // If 2FA enabled, send OTP instead of immediate login
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

  // Build a guaranteed-valid otpauth URL with fallback
  const otpauthUrl =
    secret.otpauth_url ??
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user.email)}?secret=${secret.base32}&issuer=${encodeURIComponent(issuer)}`;

  await this.userModel.findByIdAndUpdate(userId, { twoFactorSecret: secret.base32 });

  const qrCode = await qrcode.toDataURL(otpauthUrl);

  return {
    secret:     secret.base32,
    qrCode,                   
    otpauthUrl,                
  };
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
  async setSecurityPin(userId: string, pin: string) {
    if (!/^\d{6}$/.test(pin)) throw new BadRequestException('PIN must be exactly 6 digits');
    const pinHash = await bcrypt.hash(pin, 10);
    await this.userModel.findByIdAndUpdate(userId, { securityPinHash: pinHash });
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
    this.otpService.verify(this.otpService.buildKey(userId, 'email_verification'), otp);
    await this.userModel.findByIdAndUpdate(userId, { emailVerified: true, status: UserStatus.ACTIVE });
    return { message: 'Email verified successfully. Your account is now active.' };
  }

  // ── Failed Login Handler ──────────────────────────────────────
  private async recordFailedLogin(user: UserDocument) {
    const max      = this.config.get<number>('MAX_LOGIN_ATTEMPTS', 5);
    const lockMins = this.config.get<number>('LOCKOUT_DURATION_MINUTES', 30);
    const attempts = (user.failedLoginAttempts || 0) + 1;

    const update: any = { failedLoginAttempts: attempts };
    if (attempts >= max) update.lockedUntil = new Date(Date.now() + lockMins * 60 * 1000);
    await this.userModel.findByIdAndUpdate(user._id, update);
  }
}
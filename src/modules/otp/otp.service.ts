import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface OtpRecord {
  otp:       string;
  expiresAt: Date;
  attempts:  number;
}

@Injectable()
export class OtpService {
  private readonly store  = new Map<string, OtpRecord>();
  private readonly logger = new Logger(OtpService.name);

  constructor(private readonly config: ConfigService) {}

  generate(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  save(key: string, otp: string): void {
    if (!key || key.includes('::')) {
      this.logger.warn(`OTP save called with suspicious key: "${key}"`);
    }
    const expiryMs = this.config.get<number>('OTP_EXPIRY_MINUTES', 10) * 60 * 1000;
    this.store.set(key, {
      otp,
      expiresAt: new Date(Date.now() + expiryMs),
      attempts:  0,
    });
    this.logger.debug(`OTP saved for key: ${key}`);
  }

  verify(key: string, otp: string): void {
    if (!key || !otp) {
      throw new BadRequestException('OTP key and code are required');
    }

    const record = this.store.get(key);
    this.logger.debug(`OTP verify attempt — key: ${key}, found: ${!!record}`);

    if (!record) {
      throw new BadRequestException('OTP not found or expired. Request a new one.');
    }
    if (record.expiresAt < new Date()) {
      this.store.delete(key);
      throw new BadRequestException('OTP has expired. Request a new one.');
    }
    if (record.attempts >= 3) {
      this.store.delete(key);
      throw new BadRequestException('Too many incorrect attempts. Request a new OTP.');
    }
    if (record.otp !== otp.trim()) {
      record.attempts += 1;
      const remaining = 3 - record.attempts;
      throw new BadRequestException(
        `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      );
    }

    this.store.delete(key);
    this.logger.debug(`OTP verified and consumed for key: ${key}`);
  }

  buildKey(userId: string, purpose: string): string {
    if (!userId || userId.trim() === '') {
      this.logger.error(`buildKey called with empty userId for purpose: ${purpose}`);
      throw new BadRequestException('userId cannot be empty when building OTP key');
    }
    return `otp:${userId.trim()}:${purpose}`;
  }

  isEnabled(purpose: string): boolean {
    // Hook into OtpConfig later — for now always enabled
    return true;
  }
}
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface OtpRecord { otp: string; expiresAt: Date; attempts: number; }

@Injectable()
export class OtpService {
  // In production replace with Redis
  private readonly store = new Map<string, OtpRecord>();

  constructor(private readonly config: ConfigService) {}

  generate(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  save(key: string, otp: string): void {
    const expiryMs = this.config.get<number>('OTP_EXPIRY_MINUTES', 10) * 60 * 1000;
    this.store.set(key, { otp, expiresAt: new Date(Date.now() + expiryMs), attempts: 0 });
  }

  verify(key: string, otp: string): void {
    const record = this.store.get(key);
    if (!record)                throw new BadRequestException('OTP not found or expired');
    if (record.expiresAt < new Date()) {
      this.store.delete(key);
      throw new BadRequestException('OTP has expired. Request a new one.');
    }
    if (record.attempts >= 3) {
      this.store.delete(key);
      throw new BadRequestException('Too many incorrect attempts. Request a new OTP.');
    }
    if (record.otp !== otp) {
      record.attempts += 1;
      throw new BadRequestException(`Invalid OTP. ${3 - record.attempts} attempt(s) remaining.`);
    }
    this.store.delete(key);
  }

  buildKey(userId: string, purpose: string): string {
    return `otp:${userId}:${purpose}`;
  }
}
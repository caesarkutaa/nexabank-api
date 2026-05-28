import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole   { USER = 'user', ADMIN = 'admin', SUPER_ADMIN = 'super_admin' }
export enum UserStatus { ACTIVE = 'active', SUSPENDED = 'suspended', LOCKED = 'locked', PENDING = 'pending' }
export enum CreditRating { EXCELLENT = 'excellent', GOOD = 'good', FAIR = 'fair', POOR = 'poor', NO_HISTORY = 'no_history' }

@Schema({ timestamps: true, collection: 'users' })
export class User {
  // ── Identity ─────────────────────────────────────────────────
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) username: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email: string;
  @Prop({ required: true, select: false }) passwordHash: string;
  @Prop({ trim: true }) firstName: string;
  @Prop({ trim: true }) lastName: string;
  @Prop({ trim: true }) phoneNumber: string;
  @Prop() dateOfBirth: Date;
  @Prop({ select: false }) ssn: string;        // stored encrypted
  @Prop() address: string;
  @Prop() city: string;
  @Prop() state: string;
  @Prop() zipCode: string;
  @Prop({ default: 'US' }) country: string;
  @Prop({ type: String, default: 'USD' }) preferredCurrency: string;

  // ── Profile Picture ───────────────────────────────────────────
  @Prop() profilePictureUrl: string;
  @Prop() profilePicturePublicId: string;   

  // ── Role & Status ─────────────────────────────────────────────
  @Prop({ type: String, enum: UserRole,   default: UserRole.USER   }) role:   UserRole;
  @Prop({ type: String, enum: UserStatus, default: UserStatus.PENDING }) status: UserStatus;

  // ── Verification ──────────────────────────────────────────────
  @Prop({ default: false }) emailVerified: boolean;
  @Prop({ default: false }) phoneVerified: boolean;

  // ── Two-Factor Auth ───────────────────────────────────────────
  @Prop({ default: false }) twoFactorEnabled: boolean;
  @Prop({ select: false })  twoFactorSecret:  string;

  // ── Security PIN ──────────────────────────────────────────────
  @Prop({ select: false }) securityPinHash: string;
  @Prop({ default: false }) hasPinSet: boolean;

@Prop({ default: 0 })    pinAttempts: number;   
@Prop()                  pinLockedUntil: Date;    

  // ── Login Security ────────────────────────────────────────────
  @Prop({ default: 0 })  failedLoginAttempts: number;
  @Prop() lockedUntil:   Date;
  @Prop() lastLoginAt:   Date;
  @Prop() lastLoginIp:   string;
  @Prop({ select: false }) refreshTokenHash: string;

  // ── Credit ────────────────────────────────────────────────────
  @Prop({ default: 300,            min: 300, max: 850 }) creditScore:  number;
  @Prop({ type: String, enum: CreditRating, default: CreditRating.NO_HISTORY }) creditRating: CreditRating;
  @Prop({ default: 0 }) totalCreditLimit: number;
  @Prop({ default: 0 }) creditUtilization: number;

  // ── KYC Status ───────────────────────────────────────────────
  @Prop({ type: String, enum: ['not_started','pending','approved','rejected'], default: 'not_started' })
  kycStatus: string;


  @Prop({ default: false }) transferBlocked: boolean;
  @Prop() transferBlockReason: string;
  @Prop() transferBlockedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes

UserSchema.index({ phoneNumber: 1 });

// Virtual: full name
UserSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`.trim();
});
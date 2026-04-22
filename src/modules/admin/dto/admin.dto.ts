import {
  IsString, IsNotEmpty, IsEnum, IsOptional,
  IsNumber, IsBoolean, IsEmail, IsDateString,
  Min, Max, IsMongoId,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/schemas/user.schema';
import { AccountType } from '../../accounts/schemas/account.schema';
import { CryptoNetwork } from '../schemas/crypto-address.schema';

// ── User Management ───────────────────────────────────────────
export class CreateUserAdminDto {
  @ApiProperty({ example: 'jane_doe' })
  @IsString() @IsNotEmpty() username: string;

  @ApiProperty({ example: 'jane@nexabank.com' })
  @IsEmail() email: string;

  @ApiProperty({ example: 'SecurePass@123' })
  @IsString() @IsNotEmpty() password: string;

  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phoneNumber?: string;

  @ApiPropertyOptional({ enum: UserRole, default: 'user' })
  @IsOptional() @IsEnum(UserRole) role?: UserRole;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean() skipEmailVerification?: boolean;
}

export class CreateAccountAdminDto {
  @ApiProperty() @IsMongoId() userId: string;
  @ApiProperty({ enum: AccountType }) @IsEnum(AccountType) accountType: AccountType;
  @ApiPropertyOptional({ example: 5000 }) @IsOptional() @IsNumber() initialDeposit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() nickname?: string;
}

export class CreditDebitUserDto {
  @ApiProperty() @IsMongoId() accountId: string;
  @ApiProperty({ example: 1000 }) @IsNumber() @Min(0.01) amount: number;
  @ApiProperty({ enum: ['credit', 'debit'] }) @IsEnum(['credit', 'debit']) type: 'credit' | 'debit';
  @ApiProperty({ example: 'Admin credit adjustment' }) @IsString() @IsNotEmpty() reason: string;
}

// ── Transfer Management ───────────────────────────────────────
export class UpdateTransferDto {
  @ApiPropertyOptional({ enum: ['pending','processing','completed','failed','reversed','cancelled'] })
  @IsOptional() @IsString() status?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipientAccountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipientBankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() swiftCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ibanNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() processedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() adminNotes?: string;
}

export class BlockTransferDto {
  @ApiProperty() @IsMongoId() transactionId: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}

// ── Loan Management ───────────────────────────────────────────
export class ApproveLoanDto {
  @ApiProperty({ example: 9500 }) @IsNumber() @Min(1) approvedAmount: number;
  @ApiProperty({ example: 8.99 }) @IsNumber() interestRate: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class DeclineLoanDto {
  @ApiProperty({ example: 'Insufficient credit score' })
  @IsString() @IsNotEmpty() reason: string;
}

// ── KYC Management ────────────────────────────────────────────
export class ReviewKycDto {
  @ApiProperty({ enum: ['approved', 'rejected', 'resubmit'] })
  @IsEnum(['approved', 'rejected', 'resubmit']) decision: string;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ── Cheque Management ─────────────────────────────────────────
export class ReviewChequeDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsEnum(['approved', 'rejected']) decision: string;

  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

// ── Investment Management ─────────────────────────────────────
export class ReviewInvestmentDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsEnum(['approved', 'rejected']) decision: string;

  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

// ── Crypto Address ────────────────────────────────────────────
export class UpsertCryptoAddressDto {
  @ApiProperty({ enum: CryptoNetwork }) @IsEnum(CryptoNetwork) network: CryptoNetwork;
  @ApiProperty({ example: 'bc1qxy2kgdygjrsqtzq2n0yrf249abc123' })
  @IsString() @IsNotEmpty() address: string;

  @ApiProperty({ example: 'NexaBank Bitcoin Wallet' })
  @IsString() @IsNotEmpty() label: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() minimumDeposit?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() confirmationsRequired?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() memo?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Receipt Management ────────────────────────────────────────
export class EditReceiptDto {
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() fee?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() processedAt?: string;
}

// ── OTP Config ────────────────────────────────────────────────
export class UpdateOtpConfigDto {
  @ApiProperty({ example: 'transfer_confirmation' })
  @IsString() @IsNotEmpty() purpose: string;

  @ApiProperty() @IsBoolean() isEnabled: boolean;

  @ApiPropertyOptional({ example: 'Maintenance window' })
  @IsOptional() @IsString() pausedReason?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(60) expiryMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(10) maxAttempts?: number;
}

// ── Dashboard Filters ─────────────────────────────────────────
export class AdminQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(100) limit?: number;
}
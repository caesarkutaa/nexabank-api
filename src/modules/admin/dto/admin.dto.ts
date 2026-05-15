import {
  IsString, IsNotEmpty, IsEnum, IsOptional,
  IsNumber, IsBoolean, IsEmail, IsDateString,
  Min, Max, IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/schemas/user.schema';
import { AccountType } from '../../accounts/schemas/account.schema';
import {CryptoAddress } from '../schemas/crypto-address.schema';


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
  @ApiProperty({ example: 'Salary payment March 2026' }) @IsString() @IsNotEmpty() reason: string;
  @ApiPropertyOptional() @IsOptional() @IsString() senderName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() senderAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() senderBank?: string;
    @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({ description: 'Custom transaction date (ISO string)' })
  @IsOptional() @IsString() processedAt?: string;
}
 

// ── Transfer Management ───────────────────────────────────────
export class UpdateTransferDto {
  // ── Core ────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['pending','processing','completed','failed','cancelled','reversed'])
  status?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['credit','debit'])
  direction?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount?: number;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  fee?: number;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceNumber?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  balanceAfter?: number;
 
  // ── Backdating ──────────────────────────────────────────────────
  // Both fields accept any ISO 8601 string — admin can set any past or future date.
  // The audit log always records the real time the edit was made.
 
  @ApiPropertyOptional({ description: 'Backdate the transaction creation date (ISO string)' })
  @IsOptional()
  @IsString()
  createdAt?: string;            // overrides Mongoose timestamps createdAt
 
  @ApiPropertyOptional({ description: 'Backdate the processed/value date (ISO string)' })
  @IsOptional()
  @IsString()
  processedAt?: string;
 
  // ── Recipient ───────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientName?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientAccountNumber?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientBankName?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientRoutingNumber?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientCountry?: string;
 
  // ── Sender ──────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  senderName?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  senderAccountNumber?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  senderBankName?: string;
 
  // ── Wire / International ────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  swiftCode?: string;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ibanNumber?: string;
 
  // ── Internal ────────────────────────────────────────────────────
  @ApiPropertyOptional({ description: 'Admin notes — stored in metadata, never shown to user' })
  @IsOptional()
  @IsString()
  adminNotes?: string;
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
  @IsEnum(['approved', 'rejected', 'resubmit'])
  status: string;             
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionNote?: string;      
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
 
export class UpsertCryptoAddressDto {
  @ApiProperty({ example: 'bitcoin' })
  @IsString() @IsNotEmpty()
  network: string;              // 'bitcoin' | 'ethereum' | 'tron' | 'usdt_trc20' | etc.
 
  @ApiProperty({ example: 'BTC' })
  @IsString() @IsNotEmpty()
  coin: string;
 
  @ApiProperty({ example: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' })
  @IsString() @IsNotEmpty()
  address: string;
 
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  label?: string;
 
  @ApiPropertyOptional({ description: 'Memo/Destination Tag for XRP, Stellar etc.' })
  @IsOptional() @IsString()
  memo?: string;
 
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  qrCodeUrl?: string;
 
  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
 
  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  minimumDeposit?: number;
 
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @IsNumber() @Min(1) @Type(() => Number)
  confirmationsRequired?: number;
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

// ── Dashboard / List Filters ──────────────────────────────────
export class AdminQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;

  @ApiPropertyOptional({ enum: UserRole, description: 'Filter by user role' })
  @IsOptional() @IsEnum(UserRole) role?: UserRole;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(100) limit?: number;
}
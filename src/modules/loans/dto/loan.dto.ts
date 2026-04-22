import {
  IsString, IsNumber, IsPositive, IsEnum,
  IsNotEmpty, IsOptional, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LoanType } from '../schemas/loan.schema';

export class ApplyLoanDto {
  @ApiProperty({ enum: LoanType, example: 'personal' })
  @IsEnum(LoanType) loanType: LoanType;

  @ApiProperty({ example: 10000 })
  @IsNumber() @IsPositive() requestedAmount: number;

  @ApiProperty({ example: 24, description: 'Repayment term in months' })
  @IsNumber() @Min(3) @Max(360) termMonths: number;

  @ApiProperty({ example: 'Home renovation' })
  @IsString() @IsNotEmpty() purpose: string;

  @ApiProperty({ example: 75000, description: 'Annual gross income in USD' })
  @IsNumber() @IsPositive() annualIncome: number;

  @ApiPropertyOptional({ example: 'Vehicle' })
  @IsOptional() @IsString() collateral?: string;
}

export class LoanRepaymentDto {
  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsString() @IsNotEmpty() loanId: string;

  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsString() @IsNotEmpty() accountId: string;

  @ApiProperty({ example: 450.00 })
  @IsNumber() @IsPositive() amount: number;

  @ApiProperty({ example: '123456' })
  @IsString() @IsNotEmpty() otp: string;
}
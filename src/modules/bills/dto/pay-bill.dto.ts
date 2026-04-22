import {
  IsString, IsNumber, IsPositive, IsNotEmpty,
  IsEnum, IsOptional, IsBoolean, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillCategory } from '../schemas/bill.schema';

export class PayBillDto {
  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsString() @IsNotEmpty() accountId: string;

  @ApiProperty({ example: 'ConEdison' })
  @IsString() @IsNotEmpty() billerName: string;

  @ApiProperty({ example: 'CONED_NYC' })
  @IsString() @IsNotEmpty() billerCode: string;

  @ApiProperty({ example: 'ACCT-123456789', description: 'Your account number with the biller' })
  @IsString() @IsNotEmpty() accountRef: string;

  @ApiProperty({ example: 125.50 })
  @IsNumber() @IsPositive() amount: number;

  @ApiProperty({ enum: BillCategory })
  @IsEnum(BillCategory) category: BillCategory;

  @ApiPropertyOptional({ example: 'Monthly electricity bill' })
  @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean() isRecurring?: boolean;

  @ApiPropertyOptional({ example: 15, description: 'Day of month for recurring payment' })
  @IsOptional() @IsNumber() @Min(1) @Max(31) recurringDay?: number;

  @ApiProperty({ example: '123456', description: 'OTP for authorization' })
  @IsString() @IsNotEmpty() otp: string;
}
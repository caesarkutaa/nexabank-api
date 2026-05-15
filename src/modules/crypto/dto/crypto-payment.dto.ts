import { IsString, IsNumber, IsPositive, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CryptoCurrency } from '../schemas/crypto-payment.schema';

export class InitiateCryptoDto {
  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsString() @IsNotEmpty() accountId: string;

  @ApiProperty({ enum: CryptoCurrency, example: 'BTC' })
  @IsEnum(CryptoCurrency) cryptocurrency: CryptoCurrency;

  @ApiProperty({ example: 500, description: 'Amount in USD' })
  @IsNumber() @IsPositive() amountUSD: number;

  @ApiPropertyOptional({ example: 'bc1qxy2kgdygjrsqtzq2n0yrf249' })
  @IsOptional() @IsString() recipientAddress?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional() @IsString() recipientName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  otp?: string;
}
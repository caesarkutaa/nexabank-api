import {
  IsString, IsNumber, IsPositive,
  IsNotEmpty, IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiateTransferDto {
  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsString() @IsNotEmpty() fromAccountId: string;

  @ApiProperty({ example: 500 })
  @IsNumber() @IsPositive() amount: number;

  @ApiProperty({ example: 'intrabank', enum: ['intrabank','interbank','international'] })
  @IsString() @IsNotEmpty() type: string;

  @ApiProperty({ example: '123456' })
  @IsString() @IsNotEmpty() securityPin: string;
 
 
}

export class IntraBankTransferDto {
  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsString() @IsNotEmpty() fromAccountId: string;

  @ApiProperty({ example: '1234567890' })
  @IsString() @IsNotEmpty() toAccountNumber: string;

  @ApiProperty({ example: 500 })
  @IsNumber() @IsPositive() amount: number;

  @ApiPropertyOptional({ example: 'Rent payment' })
  @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional() @IsString() recipientName?: string;

  @ApiProperty({ example: '123456' })
  @IsString() @IsNotEmpty() otp: string;

  @ApiProperty({ example: '000000' })
  @IsString() @IsNotEmpty() securityPin: string;

   
  @ApiProperty({ example: 'America/New_York' })
  @IsOptional() @IsString() userTimezone?: string;
}

export class InterBankTransferDto {
  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsString() @IsNotEmpty() fromAccountId: string;

  @ApiProperty({ example: '9876543210' })
  @IsString() @IsNotEmpty() toAccountNumber: string;

  @ApiProperty({ example: '021000021' })
  @IsString() @IsNotEmpty() toRoutingNumber: string;

  @ApiProperty({ example: 'Chase Bank' })
  @IsString() @IsNotEmpty() toBankName: string;

  @ApiProperty({ example: 'Jane Smith' })
  @IsString() @IsNotEmpty() recipientName: string;

  @ApiProperty({ example: 1000 })
  @IsNumber() @IsPositive() amount: number;

  @ApiPropertyOptional({ example: 'Invoice payment' })
  @IsOptional() @IsString() description?: string;

  @ApiProperty({ example: '123456' })
  @IsString() @IsNotEmpty() otp: string;

  @ApiProperty({ example: '000000' })
  @IsString() @IsNotEmpty() securityPin: string;  


   @ApiProperty({ example: 'America/New_York' })
  @IsOptional() @IsString() userTimezone?: string;
}

export class InternationalTransferDto {
  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsString() @IsNotEmpty() fromAccountId: string;

  @ApiProperty({ example: 'Maria Garcia' })
  @IsString() @IsNotEmpty() recipientName: string;

  @ApiProperty({ example: 'Banco Santander' })
  @IsString() @IsNotEmpty() recipientBank: string;

  @ApiProperty({ example: 'BSCHESMM' })
  @IsString() @IsNotEmpty() swiftCode: string;

  @ApiProperty({ example: 'ES9121000418450200051332' })
  @IsString() @IsNotEmpty() ibanNumber: string;

  @ApiProperty({ example: 'ES' })
  @IsString() @IsNotEmpty() recipientCountry: string;

  @ApiProperty({ example: 2000 })
  @IsNumber() @IsPositive() amount: number;

  @ApiProperty({ example: 'USD' })
  @IsString() @IsNotEmpty() currency: string;

  @ApiPropertyOptional({ example: 'Family support' })
  @IsOptional() @IsString() description?: string;

  @ApiProperty({ example: '123456' })
  @IsString() @IsNotEmpty() otp: string;

  @ApiProperty({ example: '000000' })
  @IsString() @IsNotEmpty() securityPin: string;

   @ApiProperty({ example: 'America/New_York' })
  @IsOptional() @IsString() userTimezone?: string;
}  
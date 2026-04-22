import { IsString, IsNumber, IsPositive, IsNotEmpty, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BuyStockDto {
  @ApiProperty({ example: 'AAPL' })
  @IsString() @IsNotEmpty() symbol: string;

  @ApiProperty({ example: 5 })
  @IsNumber() @IsPositive() shares: number;

  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsString() @IsNotEmpty() accountId: string;
}

export class SellStockDto {
  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsString() @IsNotEmpty() investmentId: string;

  @ApiProperty({ example: 2 })
  @IsNumber() @Min(0.01) sharesToSell: number;

  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsString() @IsNotEmpty() accountId: string;
}
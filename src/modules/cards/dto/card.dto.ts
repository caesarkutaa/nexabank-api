import {
  IsString, IsNotEmpty, IsEnum, IsOptional,
  IsNumber, IsBoolean, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardNetwork } from '../schemas/virtual-card.schema';

export class IssueCardDto {
  @ApiProperty({ example: '64f1a2b3c4d5e6f7a8b9c0d1' })
  @IsString() @IsNotEmpty() accountId: string;

  @ApiProperty({ example: 'JOHN DOE' })
  @IsString() @IsNotEmpty() cardHolderName: string;

  @ApiPropertyOptional({ enum: CardNetwork, default: 'visa' })
  @IsOptional() @IsEnum(CardNetwork) network?: CardNetwork;

  @ApiPropertyOptional({ example: 'Travel Card' })
  @IsOptional() @IsString() nickname?: string;
}

export class UpdateCardLimitsDto {
  @ApiPropertyOptional({ example: 2000 })
  @IsOptional() @IsNumber() @Min(100) @Max(50000) dailyLimit?: number;

  @ApiPropertyOptional({ example: 10000 })
  @IsOptional() @IsNumber() @Min(500) @Max(200000) monthlyLimit?: number;
}

export class UpdateCardControlsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean() onlinePayments?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional() @IsBoolean() internationalPayments?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean() contactlessPayments?: boolean;
}
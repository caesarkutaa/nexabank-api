import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ example: '664f1a2b3c4d5e6f7a8b9c0d' })
  @IsString()
  @IsNotEmpty({ message: 'userId is required' })
  @Length(24, 24, { message: 'userId must be a valid MongoDB ObjectId' })
  userId: string;

  @ApiProperty({ example: '847291' })
  @IsString()
  @IsNotEmpty({ message: 'OTP is required' })
  @Length(6, 6, { message: 'OTP must be 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must be numeric' })
  otp: string;
}    
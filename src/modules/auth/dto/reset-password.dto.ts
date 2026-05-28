import {
  IsString, IsNotEmpty, IsEmail,
  MinLength, Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'john.doe@gmail.com' })
  @IsEmail() @IsNotEmpty() email: string;

  @ApiProperty({ example: '847291', description: '6-digit OTP sent to email' })
  @IsString() @IsNotEmpty() otp: string;

  @ApiProperty({ example: 'NewSecurePass@456' })
  @IsString()
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
    { message: 'Password must have uppercase, lowercase, number and special character' },
  )
  newPassword: string;

  @ApiProperty({ example: 'NewSecurePass@456' })
  @IsString() @IsNotEmpty() confirmPassword: string;
}
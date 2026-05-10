import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'john_doe' })
  @IsString() @IsNotEmpty() username: string;

  @ApiProperty({ example: 'SecurePass@123' })
  @IsString() @IsNotEmpty() password: string;

  @ApiProperty({ example: 'A1B2C3', description: 'Auto-generated captcha code' })
  @IsString() @IsNotEmpty() captchaCode: string;

  @ApiProperty({ example: 'A1B2C3', description: 'Captcha session token' })
  @IsString() @IsNotEmpty() captchaToken: string;

  @ApiProperty({ example: 'token123', description: 'Refresh token for users with 2FA enabled' })
  @IsString() refreshToken?: string;
}
import {
  IsString, IsNotEmpty, IsEmail,
  MinLength, MaxLength, Matches, IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterAdminDto {
  @ApiProperty({ example: 'admin_jane' })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username: letters, numbers, underscores only' })
  username: string;

  @ApiProperty({ example: 'jane.admin@nexabank.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'AdminPass@123' })
  @IsString()
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
    { message: 'Password must have uppercase, lowercase, number and special character' },
  )
  password: string;

  @ApiProperty({ example: 'Jane' })
  @IsString() @IsNotEmpty() firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString() @IsNotEmpty() lastName: string;

  @ApiPropertyOptional({ example: '+12125559876' })
  @IsOptional() @IsString() phoneNumber?: string;

  @ApiProperty({ example: 'NEXABANK_ADMIN_SECRET_2024', description: 'Super admin registration key' })
  @IsString() @IsNotEmpty() adminSecretKey: string;
}
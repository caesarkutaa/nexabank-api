import {
  IsEmail, IsString, MinLength, MaxLength,
  Matches, IsOptional, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'john_doe' })
  @IsString() @MinLength(3) @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username: letters, numbers, underscores only' })
  username: string;

  @ApiProperty({ example: 'john.doe@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass@123' })
  @IsString() @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message: 'Password must have uppercase, lowercase, number and special character',
  })
  password: string;

  @ApiPropertyOptional({ example: 'John' })
  @IsOptional() @IsString() firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional() @IsString() lastName?: string;

  @ApiPropertyOptional({ example: '+12125551234' })
  @IsOptional() @IsString() phoneNumber?: string;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional() @IsDateString() dateOfBirth?: string;
}
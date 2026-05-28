import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPass@123' })
  @IsString() @IsNotEmpty() currentPassword: string;

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
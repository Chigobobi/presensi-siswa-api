import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class ConfirmPasswordResetDto {
  @ApiProperty({ description: 'Token dari admin/email' })
  @IsString()
  @IsNotEmpty({ message: 'Token wajib diisi.' })
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter.' })
  @MaxLength(100)
  newPassword!: string;
}

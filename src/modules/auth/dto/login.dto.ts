import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@smkn11jakarta.sch.id' })
  @IsEmail({}, { message: 'Format email tidak valid.' })
  email!: string;

  @ApiProperty({ example: 'Admin#2026', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Password minimal 6 karakter.' })
  password!: string;
}

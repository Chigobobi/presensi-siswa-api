import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nama?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Format email tidak valid.' })
  email?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ description: 'Wajib untuk KETUA_KELAS' })
  @IsOptional()
  @IsString()
  kelasId?: string | null;

  @ApiPropertyOptional({ minLength: 8, description: 'Kosongkan jika tidak diubah' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password?: string;
}

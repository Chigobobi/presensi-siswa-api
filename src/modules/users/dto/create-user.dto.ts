import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Guru Baru' })
  @IsString()
  @IsNotEmpty({ message: 'Nama wajib diisi.' })
  @MaxLength(120)
  nama!: string;

  @ApiProperty({ example: 'guru.baru@smkn11jakarta.sch.id' })
  @IsEmail({}, { message: 'Format email tidak valid.' })
  email!: string;

  @ApiProperty({ example: 'Password#2026', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter.' })
  @MaxLength(100)
  password!: string;

  @ApiProperty({ enum: Role, example: Role.KETUA_KELAS })
  @IsEnum(Role, { message: 'Role tidak valid.' })
  role!: Role;

  @ApiPropertyOptional({
    example: 'cls_xxxxx',
    description: 'Wajib untuk role KETUA_KELAS, harus null untuk lainnya',
  })
  @ValidateIf((o) => o.role === Role.KETUA_KELAS)
  @IsString()
  @IsNotEmpty({ message: 'Ketua Kelas wajib ditugaskan ke satu kelas.' })
  kelasId?: string | null;
}

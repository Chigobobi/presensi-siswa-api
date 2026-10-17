import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateTeacherDto {
  @ApiProperty({ example: '198001012006041001', description: 'NIP unik, hanya angka' })
  @IsString()
  @IsNotEmpty({ message: 'NIP wajib diisi.' })
  @Matches(/^\d+$/, { message: 'NIP hanya boleh berisi angka.' })
  @MaxLength(30, { message: 'NIP maksimal 30 karakter.' })
  nip!: string;

  @ApiProperty({ example: 'Drs. Budi Santoso' })
  @IsString()
  @IsNotEmpty({ message: 'Nama wajib diisi.' })
  @MaxLength(120, { message: 'Nama maksimal 120 karakter.' })
  nama!: string;
}

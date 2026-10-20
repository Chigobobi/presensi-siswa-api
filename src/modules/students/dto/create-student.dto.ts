import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateStudentDto {
  @ApiProperty({ example: '251104', description: 'NIS unik, hanya angka' })
  @IsString()
  @IsNotEmpty({ message: 'NIS wajib diisi.' })
  @Matches(/^\d+$/, { message: 'NIS hanya boleh berisi angka.' })
  @MaxLength(20, { message: 'NIS maksimal 20 karakter.' })
  nis!: string;

  @ApiProperty({ example: 'Fajar Nugroho' })
  @IsString()
  @IsNotEmpty({ message: 'Nama wajib diisi.' })
  @MaxLength(120, { message: 'Nama maksimal 120 karakter.' })
  nama!: string;

  @ApiProperty({ example: 'cls_xxxxx', description: 'ID kelas' })
  @IsString()
  @IsNotEmpty({ message: 'Kelas wajib dipilih.' })
  kelasId!: string;
}

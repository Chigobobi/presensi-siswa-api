import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateClassDto {
  @ApiProperty({ example: 'XI PPLG 2', description: 'Nama kelas unik' })
  @IsString()
  @IsNotEmpty({ message: 'Nama kelas wajib diisi.' })
  @MaxLength(50, { message: 'Nama kelas maksimal 50 karakter.' })
  nama!: string;

  @ApiProperty({ example: 'Pengembangan Perangkat Lunak dan Gim' })
  @IsString()
  @IsNotEmpty({ message: 'Jurusan wajib diisi.' })
  @MaxLength(100, { message: 'Jurusan maksimal 100 karakter.' })
  jurusan!: string;
}

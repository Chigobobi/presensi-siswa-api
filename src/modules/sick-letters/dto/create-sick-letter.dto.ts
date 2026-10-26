import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateSickLetterDto {
  @ApiProperty({ example: '2026-10-24' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format tanggal: YYYY-MM-DD',
  })
  date!: string;

  @ApiProperty({ example: 'cmvaer0dg0000qdf0o1vf4w5g' })
  @IsString()
  @IsNotEmpty()
  kelasId!: string;

  @ApiProperty({ example: '251104' })
  @IsString()
  @IsNotEmpty()
  nis!: string;

  @ApiProperty({ example: 'Demam tinggi, istirahat 3 hari' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  keterangan!: string;
}

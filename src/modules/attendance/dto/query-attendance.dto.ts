import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class QueryAttendanceDto {
  @ApiProperty({ example: 'cls_xxxxx' })
  @IsString()
  @IsNotEmpty({ message: 'kelasId wajib diisi.' })
  kelasId!: string;

  @ApiProperty({ example: '2026-10-16', description: 'Format YYYY-MM-DD' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Tanggal harus format YYYY-MM-DD.',
  })
  date!: string;
}

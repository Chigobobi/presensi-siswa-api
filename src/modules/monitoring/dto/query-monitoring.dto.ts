import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryMonitoringDto {
  @ApiProperty({
    example: '2026-10-16',
    description: 'Tanggal monitoring (YYYY-MM-DD, Asia/Jakarta)',
  })
  @IsString({ message: 'Tanggal wajib diisi.' })
  date!: string;
}

export class QueryClassDetailDto {
  @ApiPropertyOptional({
    example: '2026-10-16',
    description: 'Default: hari ini (Asia/Jakarta)',
  })
  @IsOptional()
  @IsString()
  date?: string;
}

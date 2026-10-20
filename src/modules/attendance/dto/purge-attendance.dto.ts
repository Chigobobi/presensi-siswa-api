import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class PurgeAttendanceDto {
  @ApiPropertyOptional({
    default: true,
    description: 'true = dry-run (hanya hitung), false = benar-benar hapus',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  dryRun?: boolean = true;
}

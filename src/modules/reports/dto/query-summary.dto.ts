import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class QuerySummaryDto {
  @ApiProperty({ example: '2026-10-01' })
  @IsString()
  @IsNotEmpty()
  from!: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiPropertyOptional({
    description: 'Filter hanya kelas dengan status tertentu',
    enum: ['active', 'inactive'],
  })
  @IsOptional()
  @IsString()
  status?: 'active' | 'inactive';
}

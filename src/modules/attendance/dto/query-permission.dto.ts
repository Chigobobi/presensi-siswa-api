import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class QueryPermissionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  kelasId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nis?: string;

  @ApiPropertyOptional({ example: '2026-10-16' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ enum: ['all', 'used', 'unused'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'used', 'unused'])
  status?: 'all' | 'used' | 'unused' = 'all';
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ example: 'cls_xxxxx' })
  @IsString()
  @IsNotEmpty()
  kelasId!: string;

  @ApiProperty({ example: '241104', description: 'NIS siswa' })
  @IsString()
  @IsNotEmpty()
  nis!: string;

  @ApiProperty({ example: '2026-10-16', description: 'Format YYYY-MM-DD' })
  @IsString()
  @IsNotEmpty()
  date!: string;
}

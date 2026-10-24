import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class QueryHistoryDto {
  @ApiProperty({ example: 'cls_xxxxx' })
  @IsString()
  @IsNotEmpty()
  kelasId!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsString()
  @IsNotEmpty()
  from!: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsString()
  @IsNotEmpty()
  to!: string;
}

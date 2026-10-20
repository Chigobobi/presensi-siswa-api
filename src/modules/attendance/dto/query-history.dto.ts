import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class QueryHistoryDto {
  @ApiProperty({ example: 'cls_xxxxx' })
  @IsString()
  @IsNotEmpty()
  kelasId!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from harus format YYYY-MM-DD.',
  })
  from!: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to harus format YYYY-MM-DD.',
  })
  to!: string;
}

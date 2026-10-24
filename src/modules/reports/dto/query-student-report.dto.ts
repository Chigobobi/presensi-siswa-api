import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class QueryStudentReportDto {
  @ApiProperty({ example: '2026-10-01' })
  @IsString()
  @IsNotEmpty()
  from!: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsString()
  @IsNotEmpty()
  to!: string;
}

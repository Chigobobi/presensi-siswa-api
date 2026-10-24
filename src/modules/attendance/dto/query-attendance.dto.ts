import { IsDateString, IsOptional, IsString } from 'class-validator';

export class QueryAttendanceDto {
  @IsOptional()
  @IsString()
  kelasId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

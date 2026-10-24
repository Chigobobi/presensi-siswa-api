import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Format mulai harus HH:MM' })
  mulai?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Format selesai harus HH:MM' })
  selesai?: string;

  @IsOptional()
  @IsBoolean()
  terkunci?: boolean;
}

import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class UpdateScheduleDto {
  @ApiProperty({ example: '07:00', description: 'Format HH:MM (Asia/Jakarta)' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Format jam harus HH:MM (00:00-23:59).',
  })
  mulai!: string;

  @ApiProperty({ example: '12:00', description: 'Format HH:MM (Asia/Jakarta)' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Format jam harus HH:MM (00:00-23:59).',
  })
  selesai!: string;
}

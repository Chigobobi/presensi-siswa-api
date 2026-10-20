import { ApiProperty } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class AttendanceRecordInput {
  @ApiProperty({ example: '251104', description: 'NIS siswa' })
  @IsString()
  @IsNotEmpty()
  nis!: string;

  @ApiProperty({ enum: AttendanceStatus, example: AttendanceStatus.HADIR })
  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @ApiProperty({
    required: false,
    example: '07:05',
    description: 'Wajib untuk HADIR/TERLAMBAT. Format HH:MM atau HH:MM:SS.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'Waktu harus format HH:MM atau HH:MM:SS.',
  })
  waktu?: string | null;

  @ApiProperty({ required: false, example: 'Izin keluarga' })
  @IsOptional()
  @IsString()
  keterangan?: string;
}

export class SaveAttendanceDto {
  @ApiProperty({ type: [AttendanceRecordInput] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Minimal 1 siswa harus diisi.' })
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordInput)
  records!: AttendanceRecordInput[];
}

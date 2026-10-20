import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateTeacherDto {
  @ApiPropertyOptional({ example: '198001012006041001' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'NIP hanya boleh berisi angka.' })
  @MaxLength(30)
  nip?: string;

  @ApiPropertyOptional({ example: 'Drs. Budi Santoso' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nama?: string;
}

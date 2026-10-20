import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateStudentDto {
  @ApiPropertyOptional({ example: '251104' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'NIS hanya boleh berisi angka.' })
  @MaxLength(20)
  nis?: string;

  @ApiPropertyOptional({ example: 'Fajar Nugroho' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nama?: string;

  @ApiPropertyOptional({ example: 'cls_xxxxx' })
  @IsOptional()
  @IsString()
  kelasId?: string;
}

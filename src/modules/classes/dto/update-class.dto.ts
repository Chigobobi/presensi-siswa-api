import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateClassDto {
  @ApiPropertyOptional({ example: 'XI PPLG 2' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nama?: string;

  @ApiPropertyOptional({ example: 'Pengembangan Perangkat Lunak dan Gim' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jurusan?: string;
}

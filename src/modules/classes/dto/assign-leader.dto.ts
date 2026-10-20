import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AssignLeaderDto {
  @ApiProperty({
    example: 'usr_xxxxx',
    description: 'ID akun Ketua Kelas (role KETUA_KELAS, kelasId null)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Akun Ketua Kelas wajib dipilih.' })
  accountId!: string;
}

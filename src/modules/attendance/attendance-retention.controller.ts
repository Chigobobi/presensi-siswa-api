import { Body, Controller, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AttendanceRetentionService } from './attendance-retention.service';
import { PurgeAttendanceDto } from './dto/purge-attendance.dto';

@ApiTags('Attendance')
@ApiCookieAuth('session')
@Roles(Role.ADMIN)
@Controller('attendance/retention')
export class AttendanceRetentionController {
  constructor(private readonly retentionService: AttendanceRetentionService) {}

  @Post('purge')
  @ApiOperation({
    summary:
      'Bersihkan presensi semester lama (Admin). Aturan: simpan 2 semester terakhir.',
  })
  async purge(@Body() dto: PurgeAttendanceDto) {
    if (dto.dryRun ?? true) {
      const count = await this.retentionService.countOldAttendances();
      return {
        dryRun: true,
        ...count,
        message:
          `Semester aktif: ${count.currentSemester.semester} ${count.currentSemester.tahunAjaran}. ` +
          `Akan menghapus ${count.attendances} presensi + ${count.permissions} izin sebelum ${count.cutoff}.`,
      };
    }
    const result = await this.retentionService.purgeOldAttendances();
    return { dryRun: false, ...result };
  }
}

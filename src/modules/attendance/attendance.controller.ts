import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { SessionUser } from '../../common/types/session-user.type';
import { AttendanceService } from './attendance.service';
import { AttendanceHistoryService } from './attendance-history.service';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { QueryHistoryDto } from './dto/query-history.dto';

@ApiTags('Attendance')
@ApiCookieAuth('session')
@UseGuards(AuthGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly historyService: AttendanceHistoryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Baca presensi kelas pada tanggal tertentu' })
  findByClass(
    @Query() query: QueryAttendanceDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.attendanceService.findByClassAndDate(query, user);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Riwayat harian per kelas (Ketua Kelas: kelasnya, Guru Piket/Admin: semua)',
  })
  getHistory(
    @Query() query: QueryHistoryDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.historyService.getHistory(query, user);
  }

  @Put('classes/:classId/dates/:date')
  @ApiOperation({ summary: 'Simpan batch presensi kelas/tanggal (atomic)' })
  saveBatch(
    @Param('classId') classId: string,
    @Param('date') date: string,
    @Body() dto: SaveAttendanceDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.attendanceService.saveBatch(classId, date, dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Koreksi 1 catatan presensi' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.attendanceService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus 1 catatan presensi' })
  remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.attendanceService.remove(id, user);
  }
}

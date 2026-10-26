import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { SessionUser } from '../../common/types/session-user.type';
import { StatsService } from './stats.service';
import {
  QueryAttendanceStatsDto,
  QueryClassComparisonDto,
  QueryProblematicStudentsDto,
} from './dto/query-stats.dto';

@ApiTags('Stats')
@ApiCookieAuth('session')
@UseGuards(AuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('attendance')
  @ApiOperation({ summary: 'Tren kehadiran (day/month) — Admin/Guru Piket' })
  attendance(@Query() query: QueryAttendanceStatsDto, @CurrentUser() user: SessionUser) {
    return this.statsService.attendanceTrend(query, user);
  }

  @Get('problematic-students')
  @ApiOperation({ summary: 'Top siswa bermasalah (alpa terbanyak)' })
  problematic(@Query() query: QueryProblematicStudentsDto, @CurrentUser() user: SessionUser) {
    return this.statsService.problematicStudents(query, user);
  }

  @Get('class-comparison')
  @ApiOperation({ summary: 'Perbandingan antar kelas (alpa + persentase)' })
  classComparison(@Query() query: QueryClassComparisonDto, @CurrentUser() user: SessionUser) {
    return this.statsService.classComparison(query, user);
  }
}

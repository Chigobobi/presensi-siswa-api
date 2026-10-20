import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { SessionUser } from '../../common/types/session-user.type';
import { MonitoringService } from './monitoring.service';
import { QueryClassDetailDto, QueryMonitoringDto } from './dto/query-monitoring.dto';

@ApiTags('Monitoring')
@ApiCookieAuth('session')
@UseGuards(AuthGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get()
  @ApiOperation({ summary: 'Ringkasan semua kelas (Guru Piket/Admin)' })
  overview(
    @Query() query: QueryMonitoringDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.monitoringService.overview(query, user);
  }

  @Get('classes/:classId')
  @ApiOperation({
    summary: 'Detail kelas (Guru Piket/Admin, Ketua Kelas: kelasnya saja)',
  })
  classDetail(
    @Param('classId') classId: string,
    @Query() query: QueryClassDetailDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.monitoringService.classDetail(classId, query, user);
  }
}

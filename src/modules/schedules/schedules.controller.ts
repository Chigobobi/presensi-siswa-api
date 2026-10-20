import { Body, Controller, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AttendanceSession } from '@prisma/client';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { SessionUser } from '../../common/types/session-user.type';
import { SchedulesService } from './schedules.service';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

@ApiTags('Schedules')
@ApiCookieAuth('session')
@UseGuards(AuthGuard)
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @ApiOperation({ summary: 'Baca jadwal sesi (semua role)' })
  findAll() {
    return this.schedulesService.findAll();
  }

  @Put(':session')
  @ApiOperation({ summary: 'Update jam sesi (Admin)' })
  update(
    @Param('session') session: AttendanceSession,
    @Body() dto: UpdateScheduleDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.schedulesService.update(session, dto, user);
  }

  @Patch(':session/lock')
  @ApiOperation({ summary: 'Toggle kunci sesi (Admin)' })
  toggleLock(
    @Param('session') session: AttendanceSession,
    @CurrentUser() user: SessionUser,
  ) {
    return this.schedulesService.toggleLock(session, user);
  }
}

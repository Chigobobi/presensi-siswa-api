import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceHistoryService } from './attendance-history.service';
import { AttendanceRetentionService } from './attendance-retention.service';
import { AttendanceRetentionController } from './attendance-retention.controller';
import { AttendancePermissionsService } from './attendance-permissions.service';
import { AttendancePermissionsController } from './attendance-permissions.controller';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [SchedulesModule],
  controllers: [
    AttendanceController,
    AttendanceRetentionController,
    AttendancePermissionsController,
  ],
  providers: [
    AttendanceService,
    AttendanceHistoryService,
    AttendanceRetentionService,
    AttendancePermissionsService,
  ],
  exports: [
    AttendanceService,
    AttendanceHistoryService,
    AttendanceRetentionService,
    AttendancePermissionsService,
  ],
})
export class AttendanceModule {}

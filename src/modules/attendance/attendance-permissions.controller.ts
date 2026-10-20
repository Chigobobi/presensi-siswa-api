import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { SessionUser } from '../../common/types/session-user.type';
import { AttendancePermissionsService } from './attendance-permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { QueryPermissionDto } from './dto/query-permission.dto';

@ApiTags('Attendance')
@ApiCookieAuth('session')
@UseGuards(AuthGuard)
@Controller('attendance/permissions')
export class AttendancePermissionsController {
  constructor(
    private readonly permissionsService: AttendancePermissionsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Beri izin Hadir/Terlambat luar jadwal (Guru Piket/Admin)' })
  create(@Body() dto: CreatePermissionDto, @CurrentUser() user: SessionUser) {
    return this.permissionsService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List izin (scope role)' })
  findAll(
    @Query() query: QueryPermissionDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.permissionsService.findAll(query, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cabut izin yang belum dipakai (Guru Piket/Admin)' })
  remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.permissionsService.remove(id, user);
  }
}

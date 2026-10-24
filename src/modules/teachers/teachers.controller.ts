import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReqContext, type RequestContext } from '../../common/decorators/request-context.decorator';
import type { SessionUser } from '../../common/types/session-user.type';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { QueryTeacherDto } from './dto/query-teacher.dto';

@ApiTags('Teachers')
@ApiCookieAuth('session')
@UseGuards(AuthGuard)
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get()
  @ApiOperation({ summary: 'List guru (Admin)' })
  findAll(@Query() query: QueryTeacherDto, @CurrentUser() user: SessionUser) {
    return this.teachersService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail guru (Admin)' })
  findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.teachersService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Tambah guru (Admin)' })
  create(
    @Body() dto: CreateTeacherDto,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.teachersService.create(dto, user, ctx);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update guru (Admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTeacherDto,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.teachersService.update(id, dto, user, ctx);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nonaktifkan guru (Admin)' })
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.teachersService.setActive(id, false, user, ctx);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aktifkan guru (Admin)' })
  activate(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.teachersService.setActive(id, true, user, ctx);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus guru permanen (Admin)' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.teachersService.remove(id, user, ctx);
  }
}

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
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { QueryClassDto } from './dto/query-class.dto';
import { AssignLeaderDto } from './dto/assign-leader.dto';

@ApiTags('Classes')
@ApiCookieAuth('session')
@UseGuards(AuthGuard)
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  @ApiOperation({ summary: 'List kelas (scope sesuai role)' })
  findAll(@Query() query: QueryClassDto, @CurrentUser() user: SessionUser) {
    return this.classesService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail kelas' })
  findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.classesService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Tambah kelas (Admin)' })
  create(
    @Body() dto: CreateClassDto,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.classesService.create(dto, user, ctx);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update kelas (Admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClassDto,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.classesService.update(id, dto, user, ctx);
  }

  @Post(':id/leader')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign Ketua Kelas (Admin)' })
  assignLeader(
    @Param('id') id: string,
    @Body() dto: AssignLeaderDto,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.classesService.assignLeader(id, dto, user, ctx);
  }

  @Delete(':id/leader')
  @ApiOperation({ summary: 'Lepas Ketua Kelas (Admin)' })
  removeLeader(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.classesService.removeLeader(id, user, ctx);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nonaktifkan kelas (Admin)' })
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.classesService.setActive(id, false, user, ctx);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aktifkan kelas (Admin)' })
  activate(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.classesService.setActive(id, true, user, ctx);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus kelas permanen (Admin)' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.classesService.remove(id, user, ctx);
  }
}

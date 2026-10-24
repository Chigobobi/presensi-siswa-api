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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

@ApiTags('Users')
@ApiCookieAuth('session')
@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List akun (Admin)' })
  findAll(@Query() query: QueryUserDto, @CurrentUser() user: SessionUser) {
    return this.usersService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail akun (Admin)' })
  findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.usersService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Tambah akun (Admin)' })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.usersService.create(dto, user, ctx);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update akun (Admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.usersService.update(id, dto, user, ctx);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nonaktifkan akun (Admin)' })
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.usersService.setActive(id, false, user, ctx);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aktifkan akun (Admin)' })
  activate(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.usersService.setActive(id, true, user, ctx);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus akun permanen (Admin)' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.usersService.remove(id, user, ctx);
  }
}

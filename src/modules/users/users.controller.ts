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
import type { SessionUser } from '../../common/types/session-user.type';
import { UsersService } from './users.service';
import { PasswordResetService } from './password-reset.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

@ApiTags('Users')
@ApiCookieAuth('session')
@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

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
  create(@Body() dto: CreateUserDto, @CurrentUser() user: SessionUser) {
    return this.usersService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update akun (Admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.usersService.update(id, dto, user);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nonaktifkan akun (Admin)' })
  deactivate(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.usersService.setActive(id, false, user);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aktifkan akun (Admin)' })
  activate(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.usersService.setActive(id, true, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus akun permanen (Admin)' })
  remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.usersService.remove(id, user);
  }

  @Post(':id/password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Minta reset password (Admin). Token dikirim via email di prod, di-log di dev.',
  })
  async passwordReset(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ) {
    // assert admin di service
    await this.usersService.findOne(id, user); // trigger admin check + not found
    return this.passwordResetService.requestReset(id);
  }
}

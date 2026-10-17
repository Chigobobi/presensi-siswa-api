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
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';

@ApiTags('Students')
@ApiCookieAuth('session')
@UseGuards(AuthGuard)
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @ApiOperation({ summary: 'List siswa (scope sesuai role)' })
  findAll(@Query() query: QueryStudentDto, @CurrentUser() user: SessionUser) {
    return this.studentsService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail siswa' })
  findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.studentsService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Tambah siswa (Admin)' })
  create(@Body() dto: CreateStudentDto, @CurrentUser() user: SessionUser) {
    return this.studentsService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update siswa (Admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.studentsService.update(id, dto, user);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nonaktifkan siswa (Admin)' })
  deactivate(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.studentsService.setActive(id, false, user);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aktifkan siswa (Admin)' })
  activate(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.studentsService.setActive(id, true, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus siswa permanen (Admin)' })
  remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.studentsService.remove(id, user);
  }
}

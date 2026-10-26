import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReqContext, type RequestContext } from '../../common/decorators/request-context.decorator';
import type { SessionUser } from '../../common/types/session-user.type';
import { SickLettersService } from './sick-letters.service';
import { CreateSickLetterDto } from './dto/create-sick-letter.dto';
import { QuerySickLetterDto } from './dto/query-sick-letter.dto';

const MAX_SIZE_MB = parseInt(process.env.UPLOAD_MAX_SIZE_MB ?? '5', 10);

@ApiTags('Sick Letters')
@ApiCookieAuth('session')
@UseGuards(AuthGuard)
@Controller('sick-letters')
export class SickLettersController {
  constructor(private readonly service: SickLettersService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload surat sakit (PDF/JPG/PNG, max 5MB)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'date', 'kelasId', 'nis', 'keterangan'],
      properties: {
        file: { type: 'string', format: 'binary' },
        date: { type: 'string', example: '2026-10-24' },
        kelasId: { type: 'string' },
        nis: { type: 'string', example: '251104' },
        keterangan: { type: 'string', example: 'Demam tinggi' },
      },
    },
  })
  create(
    @Body() dto: CreateSickLetterDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    if (file && file.size > MAX_SIZE_MB * 1024 * 1024) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Ukuran file maksimal ${MAX_SIZE_MB} MB.`,
      });
    }
    return this.service.create(dto, file, user, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List surat sakit (scope role, pagination)' })
  findAll(@Query() query: QuerySickLetterDto, @CurrentUser() user: SessionUser) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail surat sakit' })
  findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.service.findOne(id, user);
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Download file surat sakit' })
  async download(@Param('id') id: string, @CurrentUser() user: SessionUser, @Res() res: Response) {
    const { absolutePath, fileName, mimeType, fileSize } = await this.service.getFile(id, user);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    return res.sendFile(absolutePath);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus surat sakit (+ file dari disk)' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.service.remove(id, user, ctx);
  }
}

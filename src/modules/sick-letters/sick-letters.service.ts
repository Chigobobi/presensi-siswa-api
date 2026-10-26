import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActiveStatus, AuditResult, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { AuditService } from '../audit/audit.service';
import { LocalStorageService } from './storage/local-storage.service';
import { CreateSickLetterDto } from './dto/create-sick-letter.dto';
import { QuerySickLetterDto } from './dto/query-sick-letter.dto';
import { parseDateKey } from '../../common/utils/date-key';

interface AuditCtx {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);

@Injectable()
export class SickLettersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: LocalStorageService,
  ) {}

  private async log(
    user: SessionUser,
    ctx: AuditCtx,
    action: string,
    objectId: string | null,
    metadata: Record<string, unknown>,
    result: AuditResult = AuditResult.SUCCESS,
  ) {
    await this.audit.log({
      actorId: user.id,
      action,
      objectType: 'SickLetter',
      objectId,
      result,
      metadata,
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }

  private assertCanAccess(user: SessionUser, kelasId: string) {
    if (user.role === Role.KETUA_KELAS) {
      if (!user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Akun Ketua Kelas belum ditugaskan ke kelas.',
        });
      }
      if (user.kelasId !== kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Anda hanya dapat mengakses surat sakit kelas Anda.',
        });
      }
    }
  }

  async create(
    dto: CreateSickLetterDto,
    file: Express.Multer.File | undefined,
    user: SessionUser,
    ctx: AuditCtx = {},
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'File surat sakit wajib diunggah.',
        fieldErrors: { file: 'Pilih file PDF/JPG/PNG.' },
      });
    }

    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Format file harus PDF, JPG, atau PNG.',
        fieldErrors: { file: 'Format tidak didukung.' },
      });
    }

    this.assertCanAccess(user, dto.kelasId);

    const date = parseDateKey(dto.date);

    const student = await this.prisma.student.findUnique({
      where: { nis: dto.nis },
      include: { kelas: { select: { id: true, nama: true } } },
    });
    if (!student || student.kelasId !== dto.kelasId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Siswa tidak ditemukan atau bukan anggota kelas ini.',
        fieldErrors: { nis: 'NIS tidak valid untuk kelas ini.' },
      });
    }
    if (student.status !== ActiveStatus.active) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Siswa tidak aktif.',
      });
    }

    const saved = await this.storage.save(file.originalname, file.buffer, file.mimetype);

    let created;
    try {
      created = await this.prisma.sickLetter.create({
        data: {
          date,
          kelasId: dto.kelasId,
          studentId: student.id,
          keterangan: dto.keterangan,
          fileName: saved.fileName,
          filePath: saved.filePath,
          fileSize: saved.fileSize,
          mimeType: saved.mimeType,
          uploadedById: user.id,
        },
      });
    } catch (err) {
      // Rollback: hapus file kalau DB gagal
      await this.storage.remove(saved.filePath);
      throw err;
    }

    await this.log(user, ctx, 'sickletter.create', created.id, {
      kelasId: dto.kelasId,
      kelasNama: student.kelas.nama,
      nis: student.nis,
      studentNama: student.nama,
      date: dto.date,
      fileName: saved.fileName,
      fileSize: saved.fileSize,
      mimeType: saved.mimeType,
    });

    return created;
  }

  async findAll(query: QuerySickLetterDto, user: SessionUser) {
    if (user.role === Role.KETUA_KELAS) {
      if (!user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Akun Ketua Kelas belum ditugaskan ke kelas.',
        });
      }
      if (query.kelasId && query.kelasId !== user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Anda hanya dapat melihat surat sakit kelas Anda.',
        });
      }
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const kelasId = user.role === Role.KETUA_KELAS ? user.kelasId! : query.kelasId;

    const where = {
      ...(kelasId ? { kelasId } : {}),
      ...(query.nis ? { student: { nis: query.nis } } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: parseDateKey(query.from) } : {}),
              ...(query.to ? { lte: parseDateKey(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.sickLetter.count({ where }),
      this.prisma.sickLetter.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        select: {
          id: true,
          date: true,
          kelasId: true,
          studentId: true,
          keterangan: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          createdAt: true,
          student: { select: { nis: true, nama: true } },
          kelas: { select: { nama: true } },
          uploadedBy: { select: { nama: true, email: true } },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, user: SessionUser) {
    const record = await this.prisma.sickLetter.findUnique({
      where: { id },
      include: {
        student: { select: { nis: true, nama: true } },
        kelas: { select: { id: true, nama: true } },
        uploadedBy: { select: { nama: true, email: true } },
      },
    });
    if (!record) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Surat sakit tidak ditemukan.',
      });
    }

    this.assertCanAccess(user, record.kelasId);
    return record;
  }

  async getFile(id: string, user: SessionUser) {
    const record = await this.prisma.sickLetter.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Surat sakit tidak ditemukan.',
      });
    }
    this.assertCanAccess(user, record.kelasId);

    return {
      absolutePath: this.storage.getAbsolutePath(record.filePath),
      fileName: record.fileName,
      mimeType: record.mimeType,
      fileSize: record.fileSize,
    };
  }

  async remove(id: string, user: SessionUser, ctx: AuditCtx = {}) {
    const record = await this.prisma.sickLetter.findUnique({
      where: { id },
      include: {
        student: { select: { nis: true, nama: true } },
        kelas: { select: { nama: true } },
      },
    });
    if (!record) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Surat sakit tidak ditemukan.',
      });
    }

    this.assertCanAccess(user, record.kelasId);

    await this.prisma.sickLetter.delete({ where: { id } });
    await this.storage.remove(record.filePath);

    await this.log(user, ctx, 'sickletter.delete', id, {
      kelasId: record.kelasId,
      kelasNama: record.kelas.nama,
      nis: record.student.nis,
      studentNama: record.student.nama,
      date: record.date.toISOString().slice(0, 10),
      fileName: record.fileName,
    });

    return { deleted: true, id };
  }
}

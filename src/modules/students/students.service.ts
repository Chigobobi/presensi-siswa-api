import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActiveStatus, AuditResult, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { AuditService } from '../audit/audit.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';

interface AuditCtx {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QueryStudentDto, user: SessionUser) {
    const { search, kelasId, status = 'all', page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    let effectiveKelasId = kelasId;
    if (user.role === Role.KETUA_KELAS) {
      if (!user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Akun Ketua Kelas belum ditugaskan ke kelas.',
        });
      }
      if (kelasId && kelasId !== user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Anda hanya dapat melihat siswa di kelas Anda.',
        });
      }
      effectiveKelasId = user.kelasId;
    }

    const where = {
      ...(effectiveKelasId ? { kelasId: effectiveKelasId } : {}),
      ...(status !== 'all' ? { status: status as ActiveStatus } : {}),
      ...(search
        ? {
            OR: [
              { nama: { contains: search, mode: 'insensitive' as const } },
              { nis: { contains: search } },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ kelasId: 'asc' }, { nis: 'asc' }],
        include: { kelas: { select: { id: true, nama: true, jurusan: true } } },
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
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: { kelas: { select: { id: true, nama: true, jurusan: true } } },
    });
    if (!student) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Siswa tidak ditemukan.' });
    }
    if (user.role === Role.KETUA_KELAS && student.kelasId !== user.kelasId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Anda tidak dapat melihat siswa dari kelas lain.',
      });
    }
    return student;
  }

  async create(dto: CreateStudentDto, user: SessionUser, ctx: AuditCtx = {}) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat menambah siswa.',
      });
    }

    const kelas = await this.prisma.class.findUnique({ where: { id: dto.kelasId } });
    if (!kelas) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Kelas tidak ditemukan.',
        fieldErrors: { kelasId: 'Kelas tidak valid.' },
      });
    }

    const existing = await this.prisma.student.findUnique({ where: { nis: dto.nis } });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'NIS sudah terdaftar.',
        fieldErrors: { nis: 'NIS ini sudah digunakan.' },
      });
    }

    const student = await this.prisma.student.create({
      data: { nis: dto.nis, nama: dto.nama, kelasId: dto.kelasId, status: ActiveStatus.active },
      include: { kelas: { select: { id: true, nama: true, jurusan: true } } },
    });

    await this.audit.log({
      actorId: user.id,
      action: 'student.create',
      objectType: 'Student',
      objectId: student.id,
      result: AuditResult.SUCCESS,
      metadata: { nis: student.nis, nama: student.nama, kelasId: student.kelasId },
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return student;
  }

  async update(id: string, dto: UpdateStudentDto, user: SessionUser, ctx: AuditCtx = {}) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat mengubah siswa.',
      });
    }

    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Siswa tidak ditemukan.' });
    }

    if (dto.nis && dto.nis !== student.nis) {
      const dup = await this.prisma.student.findUnique({ where: { nis: dto.nis } });
      if (dup) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'NIS sudah terdaftar.',
          fieldErrors: { nis: 'NIS ini sudah digunakan.' },
        });
      }
    }

    if (dto.kelasId) {
      const kelas = await this.prisma.class.findUnique({ where: { id: dto.kelasId } });
      if (!kelas) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Kelas tidak ditemukan.',
          fieldErrors: { kelasId: 'Kelas tidak valid.' },
        });
      }
    }

    const updated = await this.prisma.student.update({
      where: { id },
      data: dto,
      include: { kelas: { select: { id: true, nama: true, jurusan: true } } },
    });

    await this.audit.log({
      actorId: user.id,
      action: 'student.update',
      objectType: 'Student',
      objectId: id,
      result: AuditResult.SUCCESS,
      metadata: { changes: dto, before: { nis: student.nis, nama: student.nama } },
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return updated;
  }

  async setActive(id: string, active: boolean, user: SessionUser, ctx: AuditCtx = {}) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat mengubah status siswa.',
      });
    }

    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Siswa tidak ditemukan.' });
    }

    const updated = await this.prisma.student.update({
      where: { id },
      data: { status: active ? ActiveStatus.active : ActiveStatus.inactive },
      include: { kelas: { select: { id: true, nama: true, jurusan: true } } },
    });

    await this.audit.log({
      actorId: user.id,
      action: active ? 'student.activate' : 'student.deactivate',
      objectType: 'Student',
      objectId: id,
      result: AuditResult.SUCCESS,
      metadata: { nis: student.nis, nama: student.nama },
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return updated;
  }

  async remove(id: string, user: SessionUser, ctx: AuditCtx = {}) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat menghapus siswa.',
      });
    }

    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Siswa tidak ditemukan.' });
    }

    const [attendanceCount, permissionCount, sickLetterCount] = await this.prisma.$transaction([
      this.prisma.attendance.count({ where: { studentId: id } }),
      this.prisma.attendancePermission.count({ where: { studentId: id } }),
      this.prisma.sickLetter.count({ where: { studentId: id } }),
    ]);

    if (attendanceCount + permissionCount + sickLetterCount > 0) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Siswa memiliki riwayat. Nonaktifkan saja daripada menghapus permanen.',
      });
    }

    await this.prisma.student.delete({ where: { id } });

    await this.audit.log({
      actorId: user.id,
      action: 'student.delete',
      objectType: 'Student',
      objectId: id,
      result: AuditResult.SUCCESS,
      metadata: { nis: student.nis, nama: student.nama },
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return { deleted: true, id };
  }
}

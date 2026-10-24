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
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';

interface AuditCtx {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async log(
    user: SessionUser,
    ctx: AuditCtx,
    action: string,
    objectId: string | null,
    metadata: Record<string, unknown>,
  ) {
    await this.audit.log({
      actorId: user.id,
      action,
      objectType: 'Attendance',
      objectId,
      result: AuditResult.SUCCESS,
      metadata,
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }

  private resolveKelasScope(user: SessionUser, requestedKelasId?: string): string {
    if (user.role === Role.KETUA_KELAS) {
      if (!user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Akun Ketua Kelas belum ditugaskan ke kelas.',
        });
      }
      if (requestedKelasId && requestedKelasId !== user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Anda hanya dapat mengelola kelas sendiri.',
        });
      }
      return user.kelasId;
    }
    if (!requestedKelasId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'kelasId wajib diisi.',
        fieldErrors: { kelasId: 'Pilih kelas.' },
      });
    }
    return requestedKelasId;
  }

  async findByClassAndDate(query: QueryAttendanceDto, user: SessionUser) {
    const kelasId = this.resolveKelasScope(user, query.kelasId);
    const date = query.date ? new Date(query.date) : new Date();

    const items = await this.prisma.attendance.findMany({
      where: { kelasId, date },
      orderBy: { student: { nama: 'asc' } },
      include: {
        student: { select: { id: true, nis: true, nama: true } },
      },
    });

    return {
      items,
      total: items.length,
      kelasId,
      date: date.toISOString(),
    };
  }

  /**
   * PUT /attendance/classes/:classId/dates/:date
   * Body: SaveAttendanceDto { records: [{ nis, status, waktu?, keterangan? }] }
   * NIS dipetakan ke studentId dalam scope kelas.
   */
  async saveBatch(
    classId: string,
    dateStr: string,
    dto: SaveAttendanceDto,
    user: SessionUser,
    ctx: AuditCtx = {},
  ) {
    const kelasId = this.resolveKelasScope(user, classId);
    const date = new Date(dateStr);

    const kelas = await this.prisma.class.findUnique({ where: { id: kelasId } });
    if (!kelas || kelas.status !== ActiveStatus.active) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Kelas tidak ditemukan atau tidak aktif.',
      });
    }

    // Map NIS → Student (harus anggota kelas & aktif)
    const nisList = dto.records.map((r) => r.nis);
    const students = await this.prisma.student.findMany({
      where: { nis: { in: nisList }, kelasId, status: ActiveStatus.active },
      select: { id: true, nis: true },
    });
    const byNis = new Map(students.map((s) => [s.nis, s.id]));

    const missing = nisList.filter((nis) => !byNis.has(nis));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `NIS tidak valid atau bukan anggota kelas: ${missing.join(', ')}`,
        fieldErrors: { records: `NIS bermasalah: ${missing.join(', ')}` },
      });
    }

    const results = await this.prisma.$transaction(
      dto.records.map((rec) => {
        const studentId = byNis.get(rec.nis)!;
        return this.prisma.attendance.upsert({
          where: {
            date_kelasId_studentId: { date, kelasId, studentId },
          },
          update: {
            status: rec.status,
            waktu: rec.waktu ?? null,
            keterangan: rec.keterangan ?? '',
            updatedById: user.id,
          },
          create: {
            date,
            kelasId,
            studentId,
            status: rec.status,
            waktu: rec.waktu ?? null,
            keterangan: rec.keterangan ?? '',
            createdById: user.id,
            updatedById: user.id,
          },
        });
      }),
    );

    await this.log(user, ctx, 'attendance.batch_save', kelasId, {
      kelasNama: kelas.nama,
      date: date.toISOString(),
      total: results.length,
      statuses: dto.records.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {}),
    });

    return { saved: results.length, date: date.toISOString(), kelasId };
  }

  async update(id: string, dto: UpdateAttendanceDto, user: SessionUser, ctx: AuditCtx = {}) {
    const record = await this.prisma.attendance.findUnique({
      where: { id },
      include: { student: { select: { nama: true, nis: true } } },
    });
    if (!record) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Data presensi tidak ditemukan.',
      });
    }

    if (user.role === Role.KETUA_KELAS && record.kelasId !== user.kelasId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Anda tidak dapat mengubah presensi kelas lain.',
      });
    }

    const updated = await this.prisma.attendance.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.keterangan !== undefined ? { keterangan: dto.keterangan } : {}),
        ...(dto.waktu !== undefined ? { waktu: dto.waktu } : {}),
        updatedById: user.id,
      },
    });

    await this.log(user, ctx, 'attendance.update', id, {
      studentNama: record.student.nama,
      studentNis: record.student.nis,
      date: record.date.toISOString(),
      before: { status: record.status, keterangan: record.keterangan, waktu: record.waktu },
      after: { status: updated.status, keterangan: updated.keterangan, waktu: updated.waktu },
    });

    return updated;
  }

  async remove(id: string, user: SessionUser, ctx: AuditCtx = {}) {
    const record = await this.prisma.attendance.findUnique({
      where: { id },
      include: { student: { select: { nama: true, nis: true } } },
    });
    if (!record) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Data presensi tidak ditemukan.',
      });
    }

    if (user.role === Role.KETUA_KELAS && record.kelasId !== user.kelasId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Anda tidak dapat menghapus presensi kelas lain.',
      });
    }

    await this.prisma.attendance.delete({ where: { id } });

    await this.log(user, ctx, 'attendance.delete', id, {
      studentNama: record.student.nama,
      studentNis: record.student.nis,
      date: record.date.toISOString(),
      status: record.status,
    });

    return { deleted: true, id };
  }
}

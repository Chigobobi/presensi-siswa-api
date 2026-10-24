import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { AuditService } from '../audit/audit.service';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

interface AuditCtx {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class SchedulesService {
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
      objectType: 'Schedule',
      objectId,
      result: AuditResult.SUCCESS,
      metadata,
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }

  /** GET /schedules — semua role boleh lihat (jam sesi global). */
  async findAll(user: SessionUser) {
    const items = await this.prisma.schedule.findMany({
      orderBy: { session: 'asc' },
      include: {
        updatedBy: { select: { id: true, nama: true, email: true } },
      },
    });
    return { items, total: items.length, requesterRole: user.role };
  }

  async findOne(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: {
        updatedBy: { select: { id: true, nama: true, email: true } },
      },
    });
    if (!schedule) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Jadwal tidak ditemukan.',
      });
    }
    return schedule;
  }

  /** PATCH /schedules/:id — hanya Admin. */
  async update(id: string, dto: UpdateScheduleDto, user: SessionUser, ctx: AuditCtx = {}) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat mengubah jadwal.',
      });
    }

    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Jadwal tidak ditemukan.',
      });
    }

    const updated = await this.prisma.schedule.update({
      where: { id },
      data: {
        ...(dto.mulai !== undefined ? { mulai: dto.mulai } : {}),
        ...(dto.selesai !== undefined ? { selesai: dto.selesai } : {}),
        ...(dto.terkunci !== undefined ? { terkunci: dto.terkunci } : {}),
        updatedById: user.id,
      },
    });

    await this.log(user, ctx, 'schedule.update', id, {
      session: schedule.session,
      before: {
        mulai: schedule.mulai,
        selesai: schedule.selesai,
        terkunci: schedule.terkunci,
      },
      changes: dto,
    });

    return updated;
  }

  /** POST /schedules/:id/toggle-lock — hanya Admin. */
  async toggleLock(id: string, user: SessionUser, ctx: AuditCtx = {}) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat mengunci jadwal.',
      });
    }

    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Jadwal tidak ditemukan.',
      });
    }

    const updated = await this.prisma.schedule.update({
      where: { id },
      data: { terkunci: !schedule.terkunci, updatedById: user.id },
    });

    await this.log(user, ctx, 'schedule.toggle_lock', id, {
      session: schedule.session,
      before: schedule.terkunci,
      after: updated.terkunci,
    });

    return updated;
  }
}

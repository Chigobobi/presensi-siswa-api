import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AuditResult, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { QueryAuditDto } from './dto/query-audit.dto';
import { parseDateKey } from '../../common/utils/date-key';

export interface AuditLogInput {
  actorId?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  result: AuditResult;
  metadata?: Record<string, unknown> | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  private assertCanRead(user: SessionUser) {
    if (user.role !== Role.ADMIN && user.role !== Role.GURU_PIKET) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Guru Piket dan Admin yang dapat membaca audit log.',
      });
    }
  }

  async list(query: QueryAuditDto, user: SessionUser) {
    this.assertCanRead(user);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = parseDateKey(query.from);
      if (query.to) {
        const to = parseDateKey(query.to);
        to.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = { contains: query.action };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, nama: true, email: true, role: true } },
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

  /**
   * Tulis audit log. Tidak pernah throw — kalau gagal, hanya log ke console.
   * Tujuan: audit gagal tidak boleh menggagalkan aksi bisnis.
   */
  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          objectType: input.objectType,
          objectId: input.objectId ?? null,
          result: input.result,
          metadata: input.metadata
            ? (JSON.parse(JSON.stringify(input.metadata)) as any)
            : undefined,
          requestId: input.requestId ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Gagal menulis audit log: ${input.action} ${input.objectType}`,
        err as Error,
      );
    }
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActiveStatus, AuditResult, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

interface AuditCtx {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertAdmin(user: SessionUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat mengelola akun.',
      });
    }
  }

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
      objectType: 'User',
      objectId,
      result: AuditResult.SUCCESS,
      metadata,
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }

  private async assertKelasForRole(
    role: Role,
    kelasId: string | null | undefined,
    excludeId?: string,
  ) {
    if (role === Role.KETUA_KELAS) {
      if (!kelasId) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Ketua Kelas wajib ditugaskan ke satu kelas.',
          fieldErrors: { kelasId: 'Kelas wajib dipilih.' },
        });
      }
      const kelas = await this.prisma.class.findUnique({ where: { id: kelasId } });
      if (!kelas) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Kelas tidak ditemukan.',
          fieldErrors: { kelasId: 'Kelas tidak valid.' },
        });
      }
      const existing = await this.prisma.user.findFirst({
        where: {
          kelasId,
          role: Role.KETUA_KELAS,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });
      if (existing) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Kelas ini sudah memiliki akun Ketua Kelas.',
          fieldErrors: { kelasId: 'Kelas ini sudah punya Ketua Kelas.' },
        });
      }
    } else {
      if (kelasId) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Hanya Ketua Kelas yang boleh punya kelasId.',
          fieldErrors: { kelasId: 'Role ini tidak boleh punya kelas.' },
        });
      }
    }
  }

  async findAll(query: QueryUserDto, user: SessionUser) {
    this.assertAdmin(user);
    const { search, role, status = 'all', page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      ...(role ? { role } : {}),
      ...(status !== 'all' ? { status: status as ActiveStatus } : {}),
      ...(search
        ? {
            OR: [
              { nama: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          nama: true,
          email: true,
          role: true,
          status: true,
          kelasId: true,
          createdAt: true,
          updatedAt: true,
          kelasAsLeader: { select: { id: true, nama: true, jurusan: true } },
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
    this.assertAdmin(user);
    const account = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        nama: true,
        email: true,
        role: true,
        status: true,
        kelasId: true,
        createdAt: true,
        updatedAt: true,
        kelasAsLeader: { select: { id: true, nama: true, jurusan: true } },
      },
    });
    if (!account) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Akun tidak ditemukan.',
      });
    }
    return account;
  }

  async create(dto: CreateUserDto, user: SessionUser, ctx: AuditCtx = {}) {
    this.assertAdmin(user);

    const kelasId = dto.role === Role.KETUA_KELAS ? (dto.kelasId ?? null) : null;
    await this.assertKelasForRole(dto.role, kelasId);

    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Email sudah digunakan.',
        fieldErrors: { email: 'Email ini sudah terdaftar.' },
      });
    }

    const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const created = await this.prisma.user.create({
      data: {
        nama: dto.nama,
        email,
        passwordHash,
        role: dto.role,
        kelasId,
        status: ActiveStatus.active,
      },
      select: {
        id: true,
        nama: true,
        email: true,
        role: true,
        status: true,
        kelasId: true,
        createdAt: true,
      },
    });

    await this.log(user, ctx, 'user.create', created.id, {
      nama: created.nama,
      email: created.email,
      role: created.role,
      kelasId: created.kelasId,
    });

    return created;
  }

  async update(id: string, dto: UpdateUserDto, user: SessionUser, ctx: AuditCtx = {}) {
    this.assertAdmin(user);

    const account = await this.prisma.user.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Akun tidak ditemukan.',
      });
    }

    const role = dto.role ?? account.role;
    const kelasId = role === Role.KETUA_KELAS ? (dto.kelasId ?? account.kelasId) : null;

    await this.assertKelasForRole(role, kelasId, id);

    if (dto.email && dto.email.toLowerCase() !== account.email) {
      const dup = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
      });
      if (dup) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Email sudah digunakan.',
          fieldErrors: { email: 'Email ini sudah terdaftar.' },
        });
      }
    }

    const data: any = {
      ...(dto.nama !== undefined ? { nama: dto.nama } : {}),
      ...(dto.email !== undefined ? { email: dto.email.toLowerCase() } : {}),
      ...(dto.role !== undefined ? { role: dto.role } : {}),
      ...(dto.kelasId !== undefined || dto.role !== undefined ? { kelasId } : {}),
    };

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        nama: true,
        email: true,
        role: true,
        status: true,
        kelasId: true,
        updatedAt: true,
      },
    });

    await this.log(user, ctx, 'user.update', id, {
      nama: updated.nama,
      email: updated.email,
      role: updated.role,
      kelasId: updated.kelasId,
      changes: dto,
    });

    return updated;
  }

  async setActive(id: string, active: boolean, user: SessionUser, ctx: AuditCtx = {}) {
    this.assertAdmin(user);

    if (id === user.id && !active) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Anda tidak dapat menonaktifkan akun sendiri.',
      });
    }

    const account = await this.prisma.user.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Akun tidak ditemukan.',
      });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: active ? ActiveStatus.active : ActiveStatus.inactive },
      select: {
        id: true,
        nama: true,
        email: true,
        role: true,
        status: true,
        kelasId: true,
        updatedAt: true,
      },
    });

    await this.log(user, ctx, active ? 'user.activate' : 'user.deactivate', id, {
      nama: account.nama,
      email: account.email,
    });

    return updated;
  }

  async remove(id: string, user: SessionUser, ctx: AuditCtx = {}) {
    this.assertAdmin(user);

    if (id === user.id) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Anda tidak dapat menghapus akun sendiri.',
      });
    }

    const account = await this.prisma.user.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Akun tidak ditemukan.',
      });
    }

    await this.prisma.user.delete({ where: { id } });

    await this.log(user, ctx, 'user.delete', id, {
      nama: account.nama,
      email: account.email,
      role: account.role,
    });

    return { deleted: true, id };
  }
}

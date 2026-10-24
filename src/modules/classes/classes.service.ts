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
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { QueryClassDto } from './dto/query-class.dto';
import { AssignLeaderDto } from './dto/assign-leader.dto';

interface AuditCtx {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertAdmin(user: SessionUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat mengelola kelas.',
      });
    }
  }

  async findAll(query: QueryClassDto, user: SessionUser) {
    const { search, status = 'all', page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    let whereId: string | undefined;
    if (user.role === Role.KETUA_KELAS) {
      if (!user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Akun Ketua Kelas belum ditugaskan ke kelas.',
        });
      }
      whereId = user.kelasId;
    }

    const where = {
      ...(whereId ? { id: whereId } : {}),
      ...(status !== 'all' ? { status: status as ActiveStatus } : {}),
      ...(search
        ? {
            OR: [
              { nama: { contains: search, mode: 'insensitive' as const } },
              { jurusan: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.class.count({ where }),
      this.prisma.class.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nama: 'asc' },
        include: {
          leader: { select: { id: true, nama: true, email: true } },
          _count: { select: { students: true } },
        },
      }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, user: SessionUser) {
    const kelas = await this.prisma.class.findUnique({
      where: { id },
      include: {
        leader: { select: { id: true, nama: true, email: true } },
        _count: { select: { students: true } },
      },
    });
    if (!kelas) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Kelas tidak ditemukan.' });
    }
    if (user.role === Role.KETUA_KELAS && kelas.id !== user.kelasId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Anda tidak dapat melihat kelas lain.',
      });
    }
    return kelas;
  }

  async create(dto: CreateClassDto, user: SessionUser, ctx: AuditCtx = {}) {
    this.assertAdmin(user);
    const existing = await this.prisma.class.findUnique({ where: { nama: dto.nama } });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Nama kelas sudah ada.',
        fieldErrors: { nama: 'Nama kelas ini sudah digunakan.' },
      });
    }
    const kelas = await this.prisma.class.create({
      data: { nama: dto.nama, jurusan: dto.jurusan, status: ActiveStatus.active },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'class.create',
      objectType: 'Class',
      objectId: kelas.id,
      result: AuditResult.SUCCESS,
      metadata: { nama: kelas.nama, jurusan: kelas.jurusan },
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return kelas;
  }

  async update(id: string, dto: UpdateClassDto, user: SessionUser, ctx: AuditCtx = {}) {
    this.assertAdmin(user);
    const kelas = await this.prisma.class.findUnique({ where: { id } });
    if (!kelas) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Kelas tidak ditemukan.' });
    }
    if (dto.nama && dto.nama !== kelas.nama) {
      const dup = await this.prisma.class.findUnique({ where: { nama: dto.nama } });
      if (dup) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Nama kelas sudah ada.',
          fieldErrors: { nama: 'Nama kelas ini sudah digunakan.' },
        });
      }
    }
    const updated = await this.prisma.class.update({ where: { id }, data: dto });
    await this.audit.log({
      actorId: user.id,
      action: 'class.update',
      objectType: 'Class',
      objectId: id,
      result: AuditResult.SUCCESS,
      metadata: { changes: dto, before: { nama: kelas.nama } },
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return updated;
  }

  async assignLeader(id: string, dto: AssignLeaderDto, user: SessionUser, ctx: AuditCtx = {}) {
    this.assertAdmin(user);
    const kelas = await this.prisma.class.findUnique({
      where: { id },
      include: { leader: true },
    });
    if (!kelas) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Kelas tidak ditemukan.' });
    }
    const account = await this.prisma.user.findUnique({ where: { id: dto.accountId } });
    if (!account) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Akun tidak ditemukan.' });
    }
    if (account.role !== Role.KETUA_KELAS) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Akun harus memiliki role Ketua Kelas.',
        fieldErrors: { accountId: 'Role akun bukan Ketua Kelas.' },
      });
    }
    if (account.status !== ActiveStatus.active) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Akun tidak aktif.' });
    }
    if (kelas.leader && kelas.leader.id !== account.id) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Kelas ini sudah memiliki Ketua Kelas. Lepas dulu sebelum mengganti.',
      });
    }
    if (account.kelasId && account.kelasId !== id) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Akun ini sudah ditugaskan ke kelas lain. Lepas dulu dari kelas sebelumnya.',
      });
    }
    await this.prisma.user.update({ where: { id: account.id }, data: { kelasId: id } });
    await this.audit.log({
      actorId: user.id,
      action: 'class.assign_leader',
      objectType: 'Class',
      objectId: id,
      result: AuditResult.SUCCESS,
      metadata: { className: kelas.nama, accountId: account.id, accountName: account.nama },
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return this.prisma.class.findUnique({
      where: { id },
      include: {
        leader: { select: { id: true, nama: true, email: true } },
        _count: { select: { students: true } },
      },
    });
  }

  async removeLeader(id: string, user: SessionUser, ctx: AuditCtx = {}) {
    this.assertAdmin(user);
    const kelas = await this.prisma.class.findUnique({
      where: { id },
      include: { leader: true },
    });
    if (!kelas) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Kelas tidak ditemukan.' });
    }
    if (kelas.leader) {
      await this.prisma.user.update({ where: { id: kelas.leader.id }, data: { kelasId: null } });
      await this.audit.log({
        actorId: user.id,
        action: 'class.remove_leader',
        objectType: 'Class',
        objectId: id,
        result: AuditResult.SUCCESS,
        metadata: { className: kelas.nama, removedAccountId: kelas.leader.id },
        requestId: ctx.requestId ?? null,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      });
    }
    return this.prisma.class.findUnique({
      where: { id },
      include: {
        leader: { select: { id: true, nama: true, email: true } },
        _count: { select: { students: true } },
      },
    });
  }

  async setActive(id: string, active: boolean, user: SessionUser, ctx: AuditCtx = {}) {
    this.assertAdmin(user);
    const kelas = await this.prisma.class.findUnique({ where: { id } });
    if (!kelas) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Kelas tidak ditemukan.' });
    }
    const updated = await this.prisma.class.update({
      where: { id },
      data: { status: active ? ActiveStatus.active : ActiveStatus.inactive },
    });
    await this.audit.log({
      actorId: user.id,
      action: active ? 'class.activate' : 'class.deactivate',
      objectType: 'Class',
      objectId: id,
      result: AuditResult.SUCCESS,
      metadata: { nama: kelas.nama },
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return updated;
  }

  async remove(id: string, user: SessionUser, ctx: AuditCtx = {}) {
    this.assertAdmin(user);
    const kelas = await this.prisma.class.findUnique({ where: { id } });
    if (!kelas) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Kelas tidak ditemukan.' });
    }
    const [studentCount, attendanceCount, permissionCount, sickLetterCount] =
      await this.prisma.$transaction([
        this.prisma.student.count({ where: { kelasId: id } }),
        this.prisma.attendance.count({ where: { kelasId: id } }),
        this.prisma.attendancePermission.count({ where: { kelasId: id } }),
        this.prisma.sickLetter.count({ where: { kelasId: id } }),
      ]);
    if (studentCount + attendanceCount + permissionCount + sickLetterCount > 0) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Kelas masih memiliki siswa atau riwayat presensi. Nonaktifkan saja.',
      });
    }
    await this.prisma.user.updateMany({ where: { kelasId: id }, data: { kelasId: null } });
    await this.prisma.class.delete({ where: { id } });
    await this.audit.log({
      actorId: user.id,
      action: 'class.delete',
      objectType: 'Class',
      objectId: id,
      result: AuditResult.SUCCESS,
      metadata: { nama: kelas.nama },
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return { deleted: true, id };
  }
}

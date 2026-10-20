import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActiveStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(user: SessionUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat mengelola akun.',
      });
    }
  }

  private async assertKelasForRole(role: Role, kelasId: string | null | undefined) {
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
    } else {
      // Admin & Guru Piket tidak punya kelas
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

  async create(dto: CreateUserDto, user: SessionUser) {
    this.assertAdmin(user);

    await this.assertKelasForRole(dto.role, dto.kelasId ?? null);

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

    try {
      return await this.prisma.user.create({
        data: {
          nama: dto.nama,
          email,
          passwordHash,
          role: dto.role,
          kelasId: dto.role === Role.KETUA_KELAS ? dto.kelasId! : null,
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
    } catch (e: any) {
      // Prisma unique error (kelasId unik → 1 kelas 1 ketua)
      if (e?.code === 'P2002') {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Kelas ini sudah memiliki akun Ketua Kelas.',
          fieldErrors: { kelasId: 'Kelas ini sudah punya Ketua Kelas.' },
        });
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateUserDto, user: SessionUser) {
    this.assertAdmin(user);

    const account = await this.prisma.user.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Akun tidak ditemukan.',
      });
    }

    const role = dto.role ?? account.role;
    const kelasId =
      role === Role.KETUA_KELAS ? (dto.kelasId ?? account.kelasId) : null;

    await this.assertKelasForRole(role, kelasId);

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
      kelasId,
    };

    if (dto.password) {
      const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
      data.passwordHash = await bcrypt.hash(dto.password, rounds);
    }

    try {
      return await this.prisma.user.update({
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
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Kelas ini sudah memiliki akun Ketua Kelas.',
          fieldErrors: { kelasId: 'Kelas ini sudah punya Ketua Kelas.' },
        });
      }
      throw e;
    }
  }

  async setActive(id: string, active: boolean, user: SessionUser) {
    this.assertAdmin(user);

    const account = await this.prisma.user.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Akun tidak ditemukan.',
      });
    }

    // Jangan nonaktifkan diri sendiri
    if (id === user.id && !active) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Anda tidak dapat menonaktifkan akun Anda sendiri.',
      });
    }

    return this.prisma.user.update({
      where: { id },
      data: { status: active ? ActiveStatus.active : ActiveStatus.inactive },
      select: {
        id: true,
        nama: true,
        email: true,
        role: true,
        status: true,
        kelasId: true,
      },
    });
  }

  async remove(id: string, user: SessionUser) {
    this.assertAdmin(user);

    if (id === user.id) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Anda tidak dapat menghapus akun Anda sendiri.',
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
    return { deleted: true, id };
  }
}

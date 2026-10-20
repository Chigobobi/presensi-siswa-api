import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActiveStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { QueryTeacherDto } from './dto/query-teacher.dto';

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(user: SessionUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat mengakses data guru.',
      });
    }
  }

  async findAll(query: QueryTeacherDto, user: SessionUser) {
    this.assertAdmin(user);
    const { search, status = 'all', page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      ...(status !== 'all' ? { status: status as ActiveStatus } : {}),
      ...(search
        ? {
            OR: [
              { nama: { contains: search, mode: 'insensitive' as const } },
              { nip: { contains: search } },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.teacher.count({ where }),
      this.prisma.teacher.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nip: 'asc' },
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
    const teacher = await this.prisma.teacher.findUnique({ where: { id } });
    if (!teacher) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Guru tidak ditemukan.',
      });
    }
    return teacher;
  }

  async create(dto: CreateTeacherDto, user: SessionUser) {
    this.assertAdmin(user);

    const existing = await this.prisma.teacher.findUnique({
      where: { nip: dto.nip },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'NIP sudah terdaftar.',
        fieldErrors: { nip: 'NIP ini sudah digunakan.' },
      });
    }

    return this.prisma.teacher.create({
      data: {
        nip: dto.nip,
        nama: dto.nama,
        status: ActiveStatus.active,
      },
    });
  }

  async update(id: string, dto: UpdateTeacherDto, user: SessionUser) {
    this.assertAdmin(user);

    const teacher = await this.prisma.teacher.findUnique({ where: { id } });
    if (!teacher) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Guru tidak ditemukan.',
      });
    }

    if (dto.nip && dto.nip !== teacher.nip) {
      const dup = await this.prisma.teacher.findUnique({
        where: { nip: dto.nip },
      });
      if (dup) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'NIP sudah terdaftar.',
          fieldErrors: { nip: 'NIP ini sudah digunakan.' },
        });
      }
    }

    return this.prisma.teacher.update({
      where: { id },
      data: dto,
    });
  }

  async setActive(id: string, active: boolean, user: SessionUser) {
    this.assertAdmin(user);

    const teacher = await this.prisma.teacher.findUnique({ where: { id } });
    if (!teacher) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Guru tidak ditemukan.',
      });
    }

    return this.prisma.teacher.update({
      where: { id },
      data: { status: active ? ActiveStatus.active : ActiveStatus.inactive },
    });
  }

  async remove(id: string, user: SessionUser) {
    this.assertAdmin(user);

    const teacher = await this.prisma.teacher.findUnique({ where: { id } });
    if (!teacher) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Guru tidak ditemukan.',
      });
    }

    await this.prisma.teacher.delete({ where: { id } });
    return { deleted: true, id };
  }
}

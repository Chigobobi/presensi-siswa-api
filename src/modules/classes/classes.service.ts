import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActiveStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { QueryClassDto } from './dto/query-class.dto';
import { AssignLeaderDto } from './dto/assign-leader.dto';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

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

    // Scope: Ketua Kelas hanya kelasnya sendiri
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

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan.',
      });
    }

    if (user.role === Role.KETUA_KELAS && kelas.id !== user.kelasId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Anda tidak dapat melihat kelas lain.',
      });
    }

    return kelas;
  }

  async create(dto: CreateClassDto, user: SessionUser) {
    this.assertAdmin(user);

    const existing = await this.prisma.class.findUnique({
      where: { nama: dto.nama },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Nama kelas sudah ada.',
        fieldErrors: { nama: 'Nama kelas ini sudah digunakan.' },
      });
    }

    return this.prisma.class.create({
      data: {
        nama: dto.nama,
        jurusan: dto.jurusan,
        status: ActiveStatus.active,
      },
    });
  }

  async update(id: string, dto: UpdateClassDto, user: SessionUser) {
    this.assertAdmin(user);

    const kelas = await this.prisma.class.findUnique({ where: { id } });
    if (!kelas) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan.',
      });
    }

    if (dto.nama && dto.nama !== kelas.nama) {
      const dup = await this.prisma.class.findUnique({
        where: { nama: dto.nama },
      });
      if (dup) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Nama kelas sudah ada.',
          fieldErrors: { nama: 'Nama kelas ini sudah digunakan.' },
        });
      }
    }

    return this.prisma.class.update({ where: { id }, data: dto });
  }

  async assignLeader(id: string, dto: AssignLeaderDto, user: SessionUser) {
    this.assertAdmin(user);

    const kelas = await this.prisma.class.findUnique({
      where: { id },
      include: { leader: true },
    });
    if (!kelas) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan.',
      });
    }

    const account = await this.prisma.user.findUnique({
      where: { id: dto.accountId },
    });
    if (!account) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Akun tidak ditemukan.',
      });
    }

    if (account.role !== Role.KETUA_KELAS) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Akun harus memiliki role Ketua Kelas.',
        fieldErrors: { accountId: 'Role akun bukan Ketua Kelas.' },
      });
    }

    if (account.status !== ActiveStatus.active) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Akun tidak aktif.',
      });
    }

    // Satu kelas hanya 1 ketua, dan satu ketua hanya 1 kelas
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

    // Update user.kelasId (unique constraint memastikan 1 kelas 1 ketua)
    await this.prisma.user.update({
      where: { id: account.id },
      data: { kelasId: id },
    });

    return this.prisma.class.findUnique({
      where: { id },
      include: {
        leader: { select: { id: true, nama: true, email: true } },
        _count: { select: { students: true } },
      },
    });
  }

  async removeLeader(id: string, user: SessionUser) {
    this.assertAdmin(user);

    const kelas = await this.prisma.class.findUnique({
      where: { id },
      include: { leader: true },
    });
    if (!kelas) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan.',
      });
    }

    if (!kelas.leader) {
      return kelas; // tidak ada leader, no-op
    }

    await this.prisma.user.update({
      where: { id: kelas.leader.id },
      data: { kelasId: null },
    });

    return this.prisma.class.findUnique({
      where: { id },
      include: {
        leader: { select: { id: true, nama: true, email: true } },
        _count: { select: { students: true } },
      },
    });
  }

  async setActive(id: string, active: boolean, user: SessionUser) {
    this.assertAdmin(user);

    const kelas = await this.prisma.class.findUnique({ where: { id } });
    if (!kelas) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan.',
      });
    }

    return this.prisma.class.update({
      where: { id },
      data: { status: active ? ActiveStatus.active : ActiveStatus.inactive },
    });
  }

  async remove(id: string, user: SessionUser) {
    this.assertAdmin(user);

    const kelas = await this.prisma.class.findUnique({ where: { id } });
    if (!kelas) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan.',
      });
    }

    // Cek referensi
    const [studentCount, attendanceCount, permissionCount, sickLetterCount] =
      await this.prisma.$transaction([
        this.prisma.student.count({ where: { kelasId: id } }),
        this.prisma.attendance.count({ where: { kelasId: id } }),
        this.prisma.attendancePermission.count({ where: { kelasId: id } }),
        this.prisma.sickLetter.count({ where: { kelasId: id } }),
      ]);

    if (
      studentCount + attendanceCount + permissionCount + sickLetterCount > 0
    ) {
      throw new ConflictException({
        code: 'CONFLICT',
        message:
          'Kelas masih memiliki siswa atau riwayat presensi. Nonaktifkan saja daripada menghapus permanen.',
      });
    }

    // Lepas leader dulu (kalau ada)
    await this.prisma.user.updateMany({
      where: { kelasId: id },
      data: { kelasId: null },
    });

    await this.prisma.class.delete({ where: { id } });
    return { deleted: true, id };
  }
}

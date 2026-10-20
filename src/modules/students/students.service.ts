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
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryStudentDto, user: SessionUser) {
    const { search, kelasId, status = 'all', page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    // Scope: Ketua Kelas hanya kelas sendiri
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
        include: {
          kelas: { select: { id: true, nama: true, jurusan: true } },
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
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        kelas: { select: { id: true, nama: true, jurusan: true } },
      },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Siswa tidak ditemukan.',
      });
    }

    // Scope Ketua Kelas
    if (user.role === Role.KETUA_KELAS && student.kelasId !== user.kelasId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Anda tidak dapat melihat siswa dari kelas lain.',
      });
    }

    return student;
  }

  async create(dto: CreateStudentDto, user: SessionUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat menambah siswa.',
      });
    }

    // Validasi kelas ada
    const kelas = await this.prisma.class.findUnique({
      where: { id: dto.kelasId },
    });
    if (!kelas) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Kelas tidak ditemukan.',
        fieldErrors: { kelasId: 'Kelas tidak valid.' },
      });
    }

    // Cek NIS duplikat
    const existing = await this.prisma.student.findUnique({
      where: { nis: dto.nis },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'NIS sudah terdaftar.',
        fieldErrors: { nis: 'NIS ini sudah digunakan.' },
      });
    }

    return this.prisma.student.create({
      data: {
        nis: dto.nis,
        nama: dto.nama,
        kelasId: dto.kelasId,
        status: ActiveStatus.active,
      },
      include: {
        kelas: { select: { id: true, nama: true, jurusan: true } },
      },
    });
  }

  async update(id: string, dto: UpdateStudentDto, user: SessionUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat mengubah siswa.',
      });
    }

    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Siswa tidak ditemukan.',
      });
    }

    // Cek NIS unik kalau diubah
    if (dto.nis && dto.nis !== student.nis) {
      const dup = await this.prisma.student.findUnique({
        where: { nis: dto.nis },
      });
      if (dup) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'NIS sudah terdaftar.',
          fieldErrors: { nis: 'NIS ini sudah digunakan.' },
        });
      }
    }

    // Cek kelas valid kalau diubah
    if (dto.kelasId) {
      const kelas = await this.prisma.class.findUnique({
        where: { id: dto.kelasId },
      });
      if (!kelas) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Kelas tidak ditemukan.',
          fieldErrors: { kelasId: 'Kelas tidak valid.' },
        });
      }
    }

    return this.prisma.student.update({
      where: { id },
      data: dto,
      include: {
        kelas: { select: { id: true, nama: true, jurusan: true } },
      },
    });
  }

  async setActive(id: string, active: boolean, user: SessionUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat mengubah status siswa.',
      });
    }

    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Siswa tidak ditemukan.',
      });
    }

    return this.prisma.student.update({
      where: { id },
      data: { status: active ? ActiveStatus.active : ActiveStatus.inactive },
      include: {
        kelas: { select: { id: true, nama: true, jurusan: true } },
      },
    });
  }

  async remove(id: string, user: SessionUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat menghapus siswa.',
      });
    }

    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Siswa tidak ditemukan.',
      });
    }

    // Cek referensi: kalau siswa punya presensi/izin/surat sakit, tolak hapus permanen
    const [attendanceCount, permissionCount, sickLetterCount] =
      await this.prisma.$transaction([
        this.prisma.attendance.count({ where: { studentId: id } }),
        this.prisma.attendancePermission.count({ where: { studentId: id } }),
        this.prisma.sickLetter.count({ where: { studentId: id } }),
      ]);

    if (attendanceCount + permissionCount + sickLetterCount > 0) {
      throw new ConflictException({
        code: 'CONFLICT',
        message:
          'Siswa memiliki riwayat presensi/izin/surat sakit. Nonaktifkan saja daripada menghapus permanen.',
      });
    }

    await this.prisma.student.delete({ where: { id } });
    return { deleted: true, id };
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { parseDateKey } from '../../common/utils/date-key';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { QueryPermissionDto } from './dto/query-permission.dto';

@Injectable()
export class AttendancePermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePermissionDto, user: SessionUser) {
    if (user.role !== Role.GURU_PIKET && user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Guru Piket atau Admin yang dapat memberi izin.',
      });
    }

    const dateObj = parseDateKey(dto.date);

    const student = await this.prisma.student.findUnique({
      where: { nis: dto.nis },
    });
    if (!student) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Siswa dengan NIS tersebut tidak ditemukan.',
      });
    }
    if (student.status !== 'active') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Siswa tidak aktif.',
      });
    }
    if (student.kelasId !== dto.kelasId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Siswa tidak berada di kelas ini.',
      });
    }

    const existing = await this.prisma.attendancePermission.findUnique({
      where: {
        date_kelasId_studentId: {
          date: dateObj,
          kelasId: dto.kelasId,
          studentId: student.id,
        },
      },
    });
    if (existing) {
      if (existing.usedAt) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Izin untuk siswa ini sudah dipakai. Tidak bisa memberi ulang.',
        });
      }
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Izin untuk siswa ini sudah ada dan belum dipakai.',
      });
    }

    return this.prisma.attendancePermission.create({
      data: {
        date: dateObj,
        kelasId: dto.kelasId,
        studentId: student.id,
        grantedById: user.id,
      },
      include: {
        student: { select: { id: true, nis: true, nama: true } },
      },
    });
  }

  async findAll(query: QueryPermissionDto, user: SessionUser) {
    let kelasId = query.kelasId;
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
          message: 'Anda hanya dapat melihat izin di kelas Anda.',
        });
      }
      kelasId = user.kelasId;
    }

    const where: any = {};
    if (kelasId) where.kelasId = kelasId;
    if (query.date) where.date = parseDateKey(query.date);
    if (query.nis) {
      const student = await this.prisma.student.findUnique({
        where: { nis: query.nis },
      });
      if (!student) return { items: [] };
      where.studentId = student.id;
    }
    if (query.status === 'used') where.usedAt = { not: null };
    if (query.status === 'unused') where.usedAt = null;

    const items = await this.prisma.attendancePermission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { id: true, nis: true, nama: true } },
        grantedBy: { select: { id: true, nama: true } },
        usedBy: { select: { id: true, nama: true } },
      },
    });

    return { items };
  }

  async remove(id: string, user: SessionUser) {
    if (user.role !== Role.GURU_PIKET && user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Guru Piket atau Admin yang dapat mencabut izin.',
      });
    }

    const perm = await this.prisma.attendancePermission.findUnique({
      where: { id },
    });
    if (!perm) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Izin tidak ditemukan.',
      });
    }
    if (perm.usedAt) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Izin sudah dipakai, tidak bisa dicabut.',
      });
    }

    await this.prisma.attendancePermission.delete({ where: { id } });
    return { deleted: true, id };
  }

  async consumeIfExists(kelasId: string, studentId: string, dateObj: Date, userId: string) {
    const perm = await this.prisma.attendancePermission.findUnique({
      where: {
        date_kelasId_studentId: { date: dateObj, kelasId, studentId },
      },
    });
    if (!perm || perm.usedAt) return null;

    return this.prisma.attendancePermission.update({
      where: { id: perm.id },
      data: { usedAt: new Date(), usedById: userId },
    });
  }
}

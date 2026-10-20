import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceSession, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { parseHHMM } from '../../common/utils/jakarta-time';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    // Semua role boleh baca jadwal
    const items = await this.prisma.schedule.findMany({
      orderBy: { session: 'asc' },
    });
    return { items, timezone: 'Asia/Jakarta' };
  }

  async update(
    session: AttendanceSession,
    dto: UpdateScheduleDto,
    user: SessionUser,
  ) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat mengubah jadwal.',
      });
    }

    const start = parseHHMM(dto.mulai);
    const end = parseHHMM(dto.selesai);
    if (start >= end) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Jam selesai harus setelah jam mulai.',
      });
    }

    // Cek tumpang tindih dengan sesi lain
    const existing = await this.prisma.schedule.findMany();
    for (const other of existing) {
      if (other.session === session) continue;
      const otherStart = parseHHMM(other.mulai);
      const otherEnd = parseHHMM(other.selesai);
      if (start < otherEnd && end > otherStart) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: `Jadwal tumpang tindih dengan sesi ${other.session} (${other.mulai}–${other.selesai}).`,
        });
      }
    }

    return this.prisma.schedule.update({
      where: { session },
      data: {
        mulai: dto.mulai,
        selesai: dto.selesai,
        updatedById: user.id,
      },
    });
  }

  async toggleLock(session: AttendanceSession, user: SessionUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin yang dapat mengubah status kunci.',
      });
    }

    const schedule = await this.prisma.schedule.findUnique({
      where: { session },
    });
    if (!schedule) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Jadwal tidak ditemukan.',
      });
    }

    return this.prisma.schedule.update({
      where: { session },
      data: {
        terkunci: !schedule.terkunci,
        updatedById: user.id,
      },
    });
  }
}

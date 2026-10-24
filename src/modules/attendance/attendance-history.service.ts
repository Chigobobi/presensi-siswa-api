import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { parseDateKey } from 'src/common/utils/date-key';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { QueryHistoryDto } from './dto/query-history.dto';

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;

@Injectable()
export class AttendanceHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getHistory(query: QueryHistoryDto, user: SessionUser) {
    // Scope Ketua Kelas
    if (user.role === Role.KETUA_KELAS) {
      if (!user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Akun Ketua Kelas belum ditugaskan ke kelas.',
        });
      }
      if (user.kelasId !== query.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Anda hanya dapat melihat riwayat kelas Anda.',
        });
      }
    }

    const from = parseDateKey(query.from);
    const to = parseDateKey(query.to);

    if (from > to) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Tanggal "from" harus <= "to".',
      });
    }

    const daysDiff = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
    if (daysDiff > MAX_DAYS) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Rentang maksimal ${MAX_DAYS} hari.`,
      });
    }

    const kelas = await this.prisma.class.findUnique({
      where: { id: query.kelasId },
    });
    if (!kelas) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan.',
      });
    }

    // Ambil semua presensi dalam rentang
    const attendances = await this.prisma.attendance.findMany({
      where: {
        kelasId: query.kelasId,
        date: { gte: from, lte: to },
      },
      select: { date: true, status: true },
    });

    // Hitung jumlah siswa aktif (untuk denominator)
    const activeStudentCount = await this.prisma.student.count({
      where: { kelasId: query.kelasId, status: 'active' },
    });

    // Group by tanggal
    const byDate = new Map<
      string,
      { hadir: number; terlambat: number; izin: number; sakit: number; alpa: number; total: number }
    >();
    for (const a of attendances) {
      const key = a.date.toISOString().slice(0, 10);
      const c = byDate.get(key) ?? {
        hadir: 0,
        terlambat: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
        total: 0,
      };
      if (a.status === 'HADIR') c.hadir++;
      else if (a.status === 'TERLAMBAT') {
        c.hadir++;
        c.terlambat++;
      } else if (a.status === 'IZIN') c.izin++;
      else if (a.status === 'SAKIT') c.sakit++;
      else if (a.status === 'ALPA') c.alpa++;
      c.total++;
      byDate.set(key, c);
    }

    // Build rows, urutkan dari terbaru
    const rows = Array.from(byDate.entries())
      .map(([date, counts]) => ({
        date,
        hadir: counts.hadir,
        terlambat: counts.terlambat,
        izin: counts.izin,
        sakit: counts.sakit,
        alpa: counts.alpa,
        filled: counts.total,
        persentase:
          activeStudentCount > 0 ? Math.round((counts.hadir / activeStudentCount) * 100) : 0,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Total
    const totals = rows.reduce(
      (acc, r) => {
        acc.hadir += r.hadir;
        acc.terlambat += r.terlambat;
        acc.izin += r.izin;
        acc.sakit += r.sakit;
        acc.alpa += r.alpa;
        return acc;
      },
      { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0 },
    );

    return {
      kelas: { id: kelas.id, nama: kelas.nama, jurusan: kelas.jurusan },
      from: query.from,
      to: query.to,
      activeStudentCount,
      daysWithRecords: rows.length,
      rows,
      totals,
      note: 'Hadir termasuk Terlambat. Hanya hari yang memiliki catatan presensi yang ditampilkan.',
    };
  }
}

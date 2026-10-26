import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AttendanceStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { parseDateKey } from '../../common/utils/date-key';
import { countEffectiveDays } from '../../common/utils/effective-days';
import {
  QueryAttendanceStatsDto,
  QueryClassComparisonDto,
  QueryProblematicStudentsDto,
} from './dto/query-stats.dto';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdminOrPiket(user: SessionUser) {
    if (user.role !== Role.ADMIN && user.role !== Role.GURU_PIKET) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin dan Guru Piket yang dapat melihat statistik.',
      });
    }
  }

  private defaultRange(from?: string, to?: string) {
    const now = new Date();
    const start = from
      ? parseDateKey(from)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = to ? parseDateKey(to) : new Date();
    if (start > end) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Tanggal "from" harus <= "to".',
      });
    }
    return { from: start, to: end };
  }

  /** Tren kehadiran: per hari atau per bulan. */
  async attendanceTrend(query: QueryAttendanceStatsDto, user: SessionUser) {
    this.assertAdminOrPiket(user);

    const { from, to } = this.defaultRange(query.from, query.to);
    const granularity = query.granularity ?? 'day';

    const where = {
      date: { gte: from, lte: to },
      ...(query.kelasId ? { kelasId: query.kelasId } : {}),
    };

    // Agregasi di DB — groupBy status
    const grouped = await this.prisma.attendance.groupBy({
      by: ['date', 'status'],
      where,
      _count: { _all: true },
      orderBy: { date: 'asc' },
    });

    // Map: dateKey → counters
    type Counter = { hadir: number; terlambat: number; izin: number; sakit: number; alpa: number };
    const empty = (): Counter => ({ hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0 });
    const map = new Map<string, Counter>();

    for (const g of grouped) {
      const dk =
        granularity === 'month'
          ? g.date.toISOString().slice(0, 7) // YYYY-MM
          : g.date.toISOString().slice(0, 10); // YYYY-MM-DD
      const c = map.get(dk) ?? empty();
      const n = g._count._all;
      switch (g.status) {
        case 'HADIR':
          c.hadir += n;
          break;
        case 'TERLAMBAT':
          c.hadir += n;
          c.terlambat += n;
          break;
        case 'IZIN':
          c.izin += n;
          break;
        case 'SAKIT':
          c.sakit += n;
          break;
        case 'ALPA':
          c.alpa += n;
          break;
      }
      map.set(dk, c);
    }

    const buckets = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, c]) => ({ key, ...c }));

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      granularity,
      kelasId: query.kelasId ?? null,
      buckets,
      note: 'Hadir termasuk Terlambat.',
    };
  }

  /** Top siswa bermasalah (alpa terbanyak). */
  async problematicStudents(query: QueryProblematicStudentsDto, user: SessionUser) {
    this.assertAdminOrPiket(user);

    const { from, to } = this.defaultRange(query.from, query.to);
    const limit = query.limit ?? 10;

    const grouped = await this.prisma.attendance.groupBy({
      by: ['studentId'],
      where: {
        date: { gte: from, lte: to },
        status: AttendanceStatus.ALPA,
        ...(query.kelasId ? { kelasId: query.kelasId } : {}),
      },
      _count: { _all: true },
      orderBy: { _count: { studentId: 'desc' } },
      take: limit,
    });

    const studentIds = grouped.map((g) => g.studentId);
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        nis: true,
        nama: true,
        kelas: { select: { id: true, nama: true, jurusan: true } },
      },
    });
    const map = new Map(students.map((s) => [s.id, s]));

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      kelasId: query.kelasId ?? null,
      limit,
      items: grouped.map((g) => {
        const s = map.get(g.studentId);
        return {
          studentId: g.studentId,
          nis: s?.nis ?? null,
          nama: s?.nama ?? null,
          kelas: s?.kelas ?? null,
          alpa: g._count._all,
        };
      }),
    };
  }

  /** Perbandingan antar kelas: total alpa + persentase kehadiran. */
  async classComparison(query: QueryClassComparisonDto, user: SessionUser) {
    this.assertAdminOrPiket(user);

    const { from, to } = this.defaultRange(query.from, query.to);
    const effectiveDays = countEffectiveDays(from, to);

    // Ambil kelas aktif + jumlah siswa
    const classes = await this.prisma.class.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        nama: true,
        jurusan: true,
        _count: { select: { students: { where: { status: 'active' } } } },
      },
      orderBy: { nama: 'asc' },
    });

    // Agregasi presensi per kelas
    const grouped = await this.prisma.attendance.groupBy({
      by: ['kelasId', 'status'],
      where: { date: { gte: from, lte: to } },
      _count: { _all: true },
    });

    type Counter = { hadir: number; terlambat: number; izin: number; sakit: number; alpa: number };
    const empty = (): Counter => ({ hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0 });
    const byKelas = new Map<string, Counter>();
    for (const g of grouped) {
      const c = byKelas.get(g.kelasId) ?? empty();
      const n = g._count._all;
      switch (g.status) {
        case 'HADIR':
          c.hadir += n;
          break;
        case 'TERLAMBAT':
          c.hadir += n;
          c.terlambat += n;
          break;
        case 'IZIN':
          c.izin += n;
          break;
        case 'SAKIT':
          c.sakit += n;
          break;
        case 'ALPA':
          c.alpa += n;
          break;
      }
      byKelas.set(g.kelasId, c);
    }

    const items = classes.map((k) => {
      const c = byKelas.get(k.id) ?? empty();
      const totalSiswa = k._count.students;
      const maxHadir = effectiveDays * totalSiswa;
      return {
        kelasId: k.id,
        nama: k.nama,
        jurusan: k.jurusan,
        totalSiswa,
        hadir: c.hadir,
        terlambat: c.terlambat,
        izin: c.izin,
        sakit: c.sakit,
        alpa: c.alpa,
        persentase: maxHadir > 0 ? Math.round((c.hadir / maxHadir) * 100) : 0,
      };
    });

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      effectiveDays,
      items,
      note: 'Persentase = hadir / (hari efektif × total siswa aktif).',
    };
  }
}

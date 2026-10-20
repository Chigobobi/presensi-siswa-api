import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { QueryClassDetailDto, QueryMonitoringDto } from './dto/query-monitoring.dto';

function parseDateKey(date: string): Date {
  if (typeof date !== 'string' || !date.trim()) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Tanggal wajib diisi.',
    });
  }

  // Normalisasi: trim, koma → strip, unicode
  const normalized = date.trim().replace(/,/g, '-').normalize('NFKC');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: `Tanggal "${date}" tidak valid. Format: YYYY-MM-DD (contoh: 2026-10-16).`,
    });
  }

  const d = new Date(`${normalized}T00:00:00.000Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== normalized) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: `Tanggal "${date}" bukan tanggal kalender yang valid.`,
    });
  }

  return d;
}

function todayJakarta(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanMonitor(user: SessionUser) {
    if (user.role === Role.KETUA_KELAS) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Ketua Kelas tidak dapat mengakses monitoring semua kelas.',
      });
    }
  }

  /** Ringkasan semua kelas pada tanggal tertentu */
  async overview(query: QueryMonitoringDto, user: SessionUser) {
    this.assertCanMonitor(user);
    const dateObj = parseDateKey(query.date);

    // Ambil semua kelas aktif
    const classes = await this.prisma.class.findMany({
      where: { status: 'active' },
      orderBy: { nama: 'asc' },
      select: { id: true, nama: true, jurusan: true },
    });

    // Ambil jumlah siswa aktif per kelas
    const studentCounts = await this.prisma.student.groupBy({
      by: ['kelasId'],
      where: { status: 'active' },
      _count: { _all: true },
    });
    const studentCountByClass = new Map(
      studentCounts.map((s) => [s.kelasId, s._count._all]),
    );

    // Ambil semua presensi untuk tanggal ini
    const attendances = await this.prisma.attendance.findMany({
      where: { date: dateObj },
      select: { kelasId: true, studentId: true, status: true },
    });

    // Group by kelas
    const byClass = new Map<
      string,
      { hadir: number; terlambat: number; izin: number; sakit: number; alpa: number; total: number }
    >();
    for (const a of attendances) {
      const c = byClass.get(a.kelasId) ?? {
        hadir: 0,
        terlambat: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
        total: 0,
      };
      if (a.status === 'HADIR') c.hadir++;
      else if (a.status === 'TERLAMBAT') {
        c.hadir++; // Hadir mencakup Terlambat
        c.terlambat++;
      } else if (a.status === 'IZIN') c.izin++;
      else if (a.status === 'SAKIT') c.sakit++;
      else if (a.status === 'ALPA') c.alpa++;
      c.total++;
      byClass.set(a.kelasId, c);
    }

    const items = classes.map((c) => {
      const counts = byClass.get(c.id) ?? {
        hadir: 0,
        terlambat: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
        total: 0,
      };
      const siswa = studentCountByClass.get(c.id) ?? 0;
      const filled = counts.total;
      const belum = Math.max(siswa - filled, 0);
      const persentase = siswa > 0 ? Math.round((counts.hadir / siswa) * 100) : 0;
      return {
        id: c.id,
        nama: c.nama,
        jurusan: c.jurusan,
        siswa,
        hadir: counts.hadir,
        terlambat: counts.terlambat,
        izin: counts.izin,
        sakit: counts.sakit,
        alpa: counts.alpa,
        belum,
        filled,
        persentase,
      };
    });

    // Total keseluruhan
    const totals = items.reduce(
      (acc, it) => {
        acc.siswa += it.siswa;
        acc.hadir += it.hadir;
        acc.terlambat += it.terlambat;
        acc.izin += it.izin;
        acc.sakit += it.sakit;
        acc.alpa += it.alpa;
        acc.belum += it.belum;
        return acc;
      },
      { siswa: 0, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0, belum: 0 },
    );

    return {
      date: query.date,
      items,
      totals,
      note: 'Jumlah Hadir sudah termasuk siswa Terlambat; angka Terlambat adalah rincian.',
    };
  }

  /** Detail 1 kelas: daftar siswa + status presensi */
  async classDetail(
    classId: string,
    query: QueryClassDetailDto,
    user: SessionUser,
  ) {
    // Scope Ketua Kelas
    if (user.role === Role.KETUA_KELAS) {
      if (!user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Akun Ketua Kelas belum ditugaskan ke kelas.',
        });
      }
      if (user.kelasId !== classId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Anda hanya dapat melihat monitoring kelas Anda.',
        });
      }
    }

    const kelas = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!kelas) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan.',
      });
    }

    const dateStr = query.date ?? todayJakarta();
    const dateObj = parseDateKey(dateStr);

    const [students, attendances] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where: { kelasId: classId, status: 'active' },
        orderBy: { nis: 'asc' },
        select: { id: true, nis: true, nama: true },
      }),
      this.prisma.attendance.findMany({
        where: { kelasId: classId, date: dateObj },
      }),
    ]);

    const byStudent = new Map(attendances.map((a) => [a.studentId, a]));
    const records = students.map((s) => {
      const a = byStudent.get(s.id);
      return {
        nis: s.nis,
        nama: s.nama,
        status: a?.status ?? null,
        waktu: a?.waktu ?? null,
        keterangan: a?.keterangan ?? '',
      };
    });

    const hadir = records.filter(
      (r) => r.status === 'HADIR' || r.status === 'TERLAMBAT',
    ).length;
    const terlambat = records.filter((r) => r.status === 'TERLAMBAT').length;
    const izin = records.filter((r) => r.status === 'IZIN').length;
    const sakit = records.filter((r) => r.status === 'SAKIT').length;
    const alpa = records.filter((r) => r.status === 'ALPA').length;
    const belum = records.filter((r) => r.status === null).length;

    return {
      kelas: { id: kelas.id, nama: kelas.nama, jurusan: kelas.jurusan },
      date: dateStr,
      summary: {
        siswa: students.length,
        hadir,
        terlambat,
        izin,
        sakit,
        alpa,
        belum,
        persentase:
          students.length > 0
            ? Math.round((hadir / students.length) * 100)
            : 0,
      },
      records,
      note: 'Hadir termasuk Terlambat.',
    };
  }
}

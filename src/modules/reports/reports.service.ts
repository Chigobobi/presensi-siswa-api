import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { parseDateKey } from '../../common/utils/date-key';
import { ActiveStatus, AttendanceStatus, AuditResult, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { AuditService } from '../audit/audit.service';
import { QueryReportDto } from './dto/query-report.dto';
import { QuerySummaryDto } from './dto/query-summary.dto';
import { QueryStudentReportDto } from './dto/query-student-report.dto';
import { countEffectiveDays } from '../../common/utils/effective-days';
import { buildCsv, type CsvColumn } from './csv/report-csv.formatter';

interface AuditCtx {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const STATUS_KEY: Record<AttendanceStatus, 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'alpa'> = {
  HADIR: 'hadir',
  TERLAMBAT: 'terlambat',
  IZIN: 'izin',
  SAKIT: 'sakit',
  ALPA: 'alpa',
};

export interface Counter {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
}

const emptyCounter = (): Counter => ({
  hadir: 0,
  terlambat: 0,
  izin: 0,
  sakit: 0,
  alpa: 0,
});

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ============================================================
  // ENDPOINT LAMA (tidak diubah)
  // ============================================================
  async attendance(query: QueryReportDto, user: SessionUser) {
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
          message: 'Anda hanya dapat melihat laporan kelas Anda.',
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

    const totalDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (totalDays > 366) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Rentang maksimal 366 hari.',
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

    const effectiveDays = countEffectiveDays(from, to);

    const [allStudents, attendances] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where: { kelasId: query.kelasId },
        orderBy: { nis: 'asc' },
        select: { id: true, nis: true, nama: true, status: true },
      }),
      this.prisma.attendance.findMany({
        where: {
          kelasId: query.kelasId,
          date: { gte: from, lte: to },
        },
        select: { studentId: true, status: true },
      }),
    ]);

    const byStudent = new Map<string, Counter>();
    for (const a of attendances) {
      const c = byStudent.get(a.studentId) ?? emptyCounter();
      if (a.status === 'HADIR') c.hadir++;
      else if (a.status === 'TERLAMBAT') {
        c.hadir++;
        c.terlambat++;
      } else if (a.status === 'IZIN') c.izin++;
      else if (a.status === 'SAKIT') c.sakit++;
      else if (a.status === 'ALPA') c.alpa++;
      byStudent.set(a.studentId, c);
    }

    const rows = allStudents
      .filter((s) => s.status === 'active' || byStudent.has(s.id))
      .map((s) => {
        const c = byStudent.get(s.id) ?? emptyCounter();
        return {
          nis: s.nis,
          nama: s.nama,
          hadir: c.hadir,
          terlambat: c.terlambat,
          izin: c.izin,
          sakit: c.sakit,
          alpa: c.alpa,
          persentase: effectiveDays > 0 ? Math.round((c.hadir / effectiveDays) * 100) : 0,
        };
      });

    const filtered = query.status ? rows.filter((r) => r[STATUS_KEY[query.status!]] > 0) : rows;

    const totals = filtered.reduce((acc, r) => {
      acc.hadir += r.hadir;
      acc.terlambat += r.terlambat;
      acc.izin += r.izin;
      acc.sakit += r.sakit;
      acc.alpa += r.alpa;
      return acc;
    }, emptyCounter());

    return {
      kelas: { id: kelas.id, nama: kelas.nama, jurusan: kelas.jurusan },
      from: query.from,
      to: query.to,
      effectiveDays,
      statusFilter: query.status ?? null,
      rows: filtered,
      totals,
      note: 'Hadir termasuk Terlambat. Persentase = hadir / hari efektif.',
    };
  }

  // ============================================================
  // ENDPOINT BARU: summary (statistik global per kelas)
  // ============================================================
  async summary(query: QuerySummaryDto, user: SessionUser) {
    if (user.role !== Role.ADMIN && user.role !== Role.GURU_PIKET) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Hanya Admin dan Guru Piket yang dapat melihat ringkasan.',
      });
    }

    const from = parseDateKey(query.from);
    const to = parseDateKey(query.to);

    if (from > to) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Tanggal "from" harus <= "to".',
      });
    }

    const totalDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (totalDays > 366) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Rentang maksimal 366 hari.',
      });
    }

    const effectiveDays = countEffectiveDays(from, to);

    const classes = await this.prisma.class.findMany({
      where: query.status ? { status: query.status as ActiveStatus } : {},
      orderBy: { nama: 'asc' },
      select: {
        id: true,
        nama: true,
        jurusan: true,
        status: true,
        _count: { select: { students: true } },
      },
    });

    // Ambil semua attendance di rentang, group by kelas
    const attendances = await this.prisma.attendance.findMany({
      where: { date: { gte: from, lte: to } },
      select: { kelasId: true, status: true },
    });

    const byKelas = new Map<string, Counter>();
    for (const a of attendances) {
      const c = byKelas.get(a.kelasId) ?? emptyCounter();
      if (a.status === 'HADIR') c.hadir++;
      else if (a.status === 'TERLAMBAT') {
        c.hadir++;
        c.terlambat++;
      } else if (a.status === 'IZIN') c.izin++;
      else if (a.status === 'SAKIT') c.sakit++;
      else if (a.status === 'ALPA') c.alpa++;
      byKelas.set(a.kelasId, c);
    }

    const rows = classes.map((k) => {
      const c = byKelas.get(k.id) ?? emptyCounter();
      return {
        kelasId: k.id,
        nama: k.nama,
        jurusan: k.jurusan,
        status: k.status,
        totalSiswa: k._count.students,
        hadir: c.hadir,
        terlambat: c.terlambat,
        izin: c.izin,
        sakit: c.sakit,
        alpa: c.alpa,
        persentase:
          effectiveDays > 0 && k._count.students > 0
            ? Math.round((c.hadir / (effectiveDays * k._count.students)) * 100)
            : 0,
      };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.hadir += r.hadir;
        acc.terlambat += r.terlambat;
        acc.izin += r.izin;
        acc.sakit += r.sakit;
        acc.alpa += r.alpa;
        acc.totalSiswa += r.totalSiswa;
        return acc;
      },
      { ...emptyCounter(), totalSiswa: 0 },
    );

    return {
      from: query.from,
      to: query.to,
      effectiveDays,
      statusFilter: query.status ?? null,
      classes: rows,
      totals,
      note: 'Hadir termasuk Terlambat. Persentase = hadir / (hari efektif × total siswa).',
    };
  }

  // ============================================================
  // ENDPOINT BARU: studentReport (rekap per siswa lintas kelas)
  // ============================================================
  async studentReport(studentId: string, query: QueryStudentReportDto, user: SessionUser) {
    const from = parseDateKey(query.from);
    const to = parseDateKey(query.to);

    if (from > to) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Tanggal "from" harus <= "to".',
      });
    }

    const totalDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (totalDays > 366) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Rentang maksimal 366 hari.',
      });
    }

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { kelas: { select: { id: true, nama: true, jurusan: true } } },
    });
    if (!student) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Siswa tidak ditemukan.',
      });
    }

    // Scope Ketua Kelas: hanya siswa di kelasnya
    if (user.role === Role.KETUA_KELAS) {
      if (!user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Akun Ketua Kelas belum ditugaskan ke kelas.',
        });
      }
      if (student.kelasId !== user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Anda hanya dapat melihat siswa di kelas Anda.',
        });
      }
    }

    const effectiveDays = countEffectiveDays(from, to);

    const attendances = await this.prisma.attendance.findMany({
      where: {
        studentId,
        date: { gte: from, lte: to },
      },
      select: { kelasId: true, status: true },
      orderBy: { date: 'asc' },
    });

    // Group by kelasId
    const byKelas = new Map<string, Counter>();
    const total = emptyCounter();
    for (const a of attendances) {
      const c = byKelas.get(a.kelasId) ?? emptyCounter();
      if (a.status === 'HADIR') {
        c.hadir++;
        total.hadir++;
      } else if (a.status === 'TERLAMBAT') {
        c.hadir++;
        c.terlambat++;
        total.hadir++;
        total.terlambat++;
      } else if (a.status === 'IZIN') {
        c.izin++;
        total.izin++;
      } else if (a.status === 'SAKIT') {
        c.sakit++;
        total.sakit++;
      } else if (a.status === 'ALPA') {
        c.alpa++;
        total.alpa++;
      }
      byKelas.set(a.kelasId, c);
    }

    // Ambil nama kelas untuk semua kelasId yang muncul
    const kelasIds = Array.from(byKelas.keys());
    const kelasList = await this.prisma.class.findMany({
      where: { id: { in: kelasIds } },
      select: { id: true, nama: true, jurusan: true },
    });
    const kelasMap = new Map(kelasList.map((k) => [k.id, k]));

    const perKelas = kelasIds.map((kelasId) => {
      const c = byKelas.get(kelasId) ?? emptyCounter();
      const k = kelasMap.get(kelasId);
      return {
        kelasId,
        kelasNama: k?.nama ?? null,
        jurusan: k?.jurusan ?? null,
        hadir: c.hadir,
        terlambat: c.terlambat,
        izin: c.izin,
        sakit: c.sakit,
        alpa: c.alpa,
      };
    });

    return {
      student: {
        id: student.id,
        nis: student.nis,
        nama: student.nama,
        status: student.status,
        kelas: student.kelas,
      },
      from: query.from,
      to: query.to,
      effectiveDays,
      total: {
        ...total,
        persentase: effectiveDays > 0 ? Math.round((total.hadir / effectiveDays) * 100) : 0,
      },
      perKelas,
      note: 'Hadir termasuk Terlambat. Persentase = hadir / hari efektif.',
    };
  }

  // ============================================================
  // ENDPOINT BARU: exportCsv (unduh rekap kelas sebagai CSV)
  // ============================================================
  async exportCsv(
    query: QueryReportDto,
    user: SessionUser,
    ctx: AuditCtx = {},
  ): Promise<{ filename: string; csv: string }> {
    const report = await this.attendance(query, user);

    type Row = (typeof report.rows)[number];
    const columns: CsvColumn<Row>[] = [
      { header: 'NIS', value: (r) => r.nis },
      { header: 'Nama', value: (r) => r.nama },
      { header: 'Hadir', value: (r) => r.hadir },
      { header: 'Terlambat', value: (r) => r.terlambat },
      { header: 'Izin', value: (r) => r.izin },
      { header: 'Sakit', value: (r) => r.sakit },
      { header: 'Alpa', value: (r) => r.alpa },
      { header: 'Persentase', value: (r) => `${r.persentase}%` },
    ];

    const footer = (totals: Row): Array<string | number> => [
      'TOTAL',
      '',
      totals.hadir,
      totals.terlambat,
      totals.izin,
      totals.sakit,
      totals.alpa,
      '',
    ];

    const csv = buildCsv(columns, report.rows, footer);

    const safeKelas = report.kelas.nama.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
    const filename = `rekap-${safeKelas}-${report.from}_${report.to}.csv`;

    // Audit export (data keluar dari sistem)
    try {
      await this.audit.log({
        actorId: user.id,
        action: 'report.export.csv',
        objectType: 'Report',
        objectId: report.kelas.id,
        result: AuditResult.SUCCESS,
        metadata: {
          kelasId: report.kelas.id,
          kelasNama: report.kelas.nama,
          from: report.from,
          to: report.to,
          totalRows: report.rows.length,
          actorNama: user.nama,
        },
        requestId: ctx.requestId ?? null,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      });
    } catch (err) {
      this.logger.error('Gagal menulis audit export CSV', err as Error);
    }

    return { filename, csv };
  }
}

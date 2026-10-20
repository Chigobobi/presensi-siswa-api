import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

type Semester = 'GANJIL' | 'GENAP';

export interface SemesterInfo {
  semester: Semester;
  tahunAjaran: string;
  start: Date; // inklusif
  end: Date; // inklusif
}

/**
 * Retensi berbasis semester:
 * - GANJIL : Juli – Desember (tahun ajaran X/X+1)
 * - GENAP  : Januari – Juni  (tahun ajaran X-1/X)
 *
 * Data yang disimpan: 2 semester terakhir (aktif + selesai bulan lalu).
 * Data sebelum cutoff DIHAPUS.
 */
@Injectable()
export class AttendanceRetentionService {
  private readonly logger = new Logger(AttendanceRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Tentukan semester berdasarkan tanggal */
  getSemesterInfo(date: Date = new Date()): SemesterInfo {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12

    if (month >= 7) {
      // Juli-Desember → GANJIL tahun ajaran year/year+1
      return {
        semester: 'GANJIL',
        tahunAjaran: `${year}/${year + 1}`,
        start: new Date(Date.UTC(year, 6, 1)), // 1 Juli
        end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)), // 31 Des
      };
    } else {
      // Januari-Juni → GENAP tahun ajaran year-1/year
      return {
        semester: 'GENAP',
        tahunAjaran: `${year - 1}/${year}`,
        start: new Date(Date.UTC(year, 0, 1)), // 1 Jan
        end: new Date(Date.UTC(year, 5, 30, 23, 59, 59, 999)), // 30 Jun
      };
    }
  }

  /**
   * Hitung cutoff: data dengan `date < cutoff` akan DIHAPUS.
   *
   * Aturan: simpan 2 semester terakhir.
   * - Kalau sekarang GENAP (Jan-Jun): cutoff = 1 Juli tahun lalu
   * - Kalau sekarang GANJIL (Jul-Des): cutoff = 1 Januari tahun sekarang
   */
  getCutoffDate(now: Date = new Date()): Date {
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    if (month >= 7) {
      // Juli-Desember → simpan GANJIL sekarang + GENAP tahun ini
      // cutoff = 1 Januari tahun ini
      return new Date(Date.UTC(year, 0, 1));
    } else {
      // Januari-Juni → simpan GENAP sekarang + GANJIL tahun lalu
      // cutoff = 1 Juli tahun lalu
      return new Date(Date.UTC(year - 1, 6, 1));
    }
  }

  /** Hapus presensi & izin sebelum cutoff */
  async purgeOldAttendances(): Promise<{
    deleted: number;
    attendances: number;
    permissions: number;
    cutoff: string;
    currentSemester: SemesterInfo;
  }> {
    const cutoff = this.getCutoffDate();
    const currentSemester = this.getSemesterInfo();

    const [attendanceResult, permissionResult] = await this.prisma.$transaction([
      this.prisma.attendance.deleteMany({
        where: { date: { lt: cutoff } },
      }),
      this.prisma.attendancePermission.deleteMany({
        where: { date: { lt: cutoff } },
      }),
    ]);

    const total = attendanceResult.count + permissionResult.count;
    this.logger.log(
      `[Retensi Semester] Semester aktif: ${currentSemester.semester} ${currentSemester.tahunAjaran}. ` +
        `Cutoff: ${cutoff.toISOString().slice(0, 10)}. ` +
        `Dihapus ${attendanceResult.count} presensi + ${permissionResult.count} izin.`,
    );

    return {
      deleted: total,
      attendances: attendanceResult.count,
      permissions: permissionResult.count,
      cutoff: cutoff.toISOString().slice(0, 10),
      currentSemester,
    };
  }

  /** Dry-run: hitung berapa yang akan dihapus, tanpa hapus */
  async countOldAttendances(): Promise<{
    attendances: number;
    permissions: number;
    cutoff: string;
    currentSemester: SemesterInfo;
    retainedSince: string;
  }> {
    const cutoff = this.getCutoffDate();
    const currentSemester = this.getSemesterInfo();

    const [attendances, permissions] = await this.prisma.$transaction([
      this.prisma.attendance.count({ where: { date: { lt: cutoff } } }),
      this.prisma.attendancePermission.count({
        where: { date: { lt: cutoff } },
      }),
    ]);

    return {
      attendances,
      permissions,
      cutoff: cutoff.toISOString().slice(0, 10),
      currentSemester,
      retainedSince: cutoff.toISOString().slice(0, 10),
    };
  }

  /**
   * Cron: jalan setiap tanggal 1, jam 02:00 WIB.
   * Pada:
   * - 1 Juli  → bersihkan data sebelum 1 Januari (setelah semester Genap selesai)
   * - 1 Januari → bersihkan data sebelum 1 Juli tahun lalu (setelah Ganjil selesai)
   */
  @Cron('0 2 1 * *', {
    name: 'purge-old-attendances',
    timeZone: 'Asia/Jakarta',
  })
  async handleMonthlyPurge(): Promise<void> {
    this.logger.log(
      '[Retensi Semester] Mulai pembersihan data semester yang sudah lewat...',
    );
    try {
      const result = await this.purgeOldAttendances();
      this.logger.log(
        `[Retensi Semester] Selesai. ${result.deleted} record dihapus (cutoff: ${result.cutoff}).`,
      );
    } catch (err) {
      this.logger.error(
        '[Retensi Semester] Gagal membersihkan presensi.',
        err as Error,
      );
    }
  }
}

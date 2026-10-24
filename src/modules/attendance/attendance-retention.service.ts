import { Injectable, Logger } from '@nestjs/common';
import { AuditResult } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface SemesterInfo {
  semester: 'Ganjil' | 'Genap';
  tahunAjaran: string; // contoh: "2025/2026"
  startDate: Date;
  endDate: Date;
}

/**
 * Service retensi presensi.
 * Aturan: simpan 2 semester terakhir. Data yang lebih lama dihapus.
 * 1 semester = 6 bulan (Ganjil: Jul–Des, Genap: Jan–Jun).
 */
@Injectable()
export class AttendanceRetentionService {
  private readonly logger = new Logger(AttendanceRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Hitung semester aktif berdasarkan tanggal acuan (default: hari ini). */
  private getSemesterForDate(ref: Date): SemesterInfo {
    const month = ref.getMonth() + 1; // 1-12
    const year = ref.getFullYear();

    if (month >= 7) {
      // Ganjil: Juli - Desember
      return {
        semester: 'Ganjil',
        tahunAjaran: `${year}/${year + 1}`,
        startDate: new Date(year, 6, 1), // 1 Juli
        endDate: new Date(year, 11, 31), // 31 Des
      };
    }
    // Genap: Januari - Juni
    return {
      semester: 'Genap',
      tahunAjaran: `${year - 1}/${year}`,
      startDate: new Date(year, 0, 1), // 1 Jan
      endDate: new Date(year, 5, 30), // 30 Jun
    };
  }

  /**
   * Hitung cutoff = awal semester N-2 (dua semester sebelum semester aktif).
   * Data dengan tanggal < cutoff akan dihapus.
   */
  private getCutoffDate(ref: Date = new Date()): Date {
    const current = this.getSemesterForDate(ref);

    // Mundur 2 semester dari awal semester aktif
    let cutoffYear = current.startDate.getFullYear();
    let cutoffMonth = current.startDate.getMonth(); // 0-indexed

    // Mundur 12 bulan (2 semester)
    cutoffMonth -= 12;
    while (cutoffMonth < 0) {
      cutoffMonth += 12;
      cutoffYear -= 1;
    }

    return new Date(cutoffYear, cutoffMonth, 1);
  }

  /**
   * Hitung berapa baris yang akan dihapus (dry-run).
   * Return shape harus sesuai AttendanceRetentionController:
   * { currentSemester: { semester, tahunAjaran }, attendances, permissions, retentionDays, cutoff }
   */
  async countOldAttendances() {
    const cutoff = this.getCutoffDate();
    const currentSemester = this.getSemesterForDate(new Date());

    const [attendances, permissions] = await this.prisma.$transaction([
      this.prisma.attendance.count({ where: { date: { lt: cutoff } } }),
      this.prisma.attendancePermission.count({ where: { date: { lt: cutoff } } }),
    ]);

    return {
      currentSemester: {
        semester: currentSemester.semester,
        tahunAjaran: currentSemester.tahunAjaran,
      },
      attendances,
      permissions,
      retentionDays: null, // tidak dipakai lagi — cutoff eksplisit
      cutoff: cutoff.toISOString(),
    };
  }

  /** Hapus presensi + izin lama. Dicatat ke audit. */
  async purgeOldAttendances(requestId?: string | null) {
    const cutoff = this.getCutoffDate();
    const currentSemester = this.getSemesterForDate(new Date());

    const [attendanceCount, permissionCount] = await this.prisma.$transaction([
      this.prisma.attendance.count({ where: { date: { lt: cutoff } } }),
      this.prisma.attendancePermission.count({ where: { date: { lt: cutoff } } }),
    ]);

    if (attendanceCount + permissionCount === 0) {
      this.logger.log(`Retention purge: tidak ada data sebelum ${cutoff.toISOString()}.`);
      await this.audit.log({
        actorId: null,
        action: 'attendance.retention_purge',
        objectType: 'Attendance',
        objectId: null,
        result: AuditResult.SUCCESS,
        metadata: {
          currentSemester,
          cutoff: cutoff.toISOString(),
          deletedAttendances: 0,
          deletedPermissions: 0,
        },
        requestId: requestId ?? null,
        ipAddress: null,
        userAgent: null,
      });
      return {
        currentSemester: {
          semester: currentSemester.semester,
          tahunAjaran: currentSemester.tahunAjaran,
        },
        attendances: 0,
        permissions: 0,
        cutoff: cutoff.toISOString(),
      };
    }

    const [deletedAttendances, deletedPermissions] = await this.prisma.$transaction([
      this.prisma.attendance.deleteMany({ where: { date: { lt: cutoff } } }),
      this.prisma.attendancePermission.deleteMany({ where: { date: { lt: cutoff } } }),
    ]);

    this.logger.log(
      `Retention purge: hapus ${deletedAttendances.count} presensi + ${deletedPermissions.count} izin sebelum ${cutoff.toISOString()}.`,
    );

    await this.audit.log({
      actorId: null,
      action: 'attendance.retention_purge',
      objectType: 'Attendance',
      objectId: null,
      result: AuditResult.SUCCESS,
      metadata: {
        currentSemester,
        cutoff: cutoff.toISOString(),
        deletedAttendances: deletedAttendances.count,
        deletedPermissions: deletedPermissions.count,
      },
      requestId: requestId ?? null,
      ipAddress: null,
      userAgent: null,
    });

    return {
      currentSemester: {
        semester: currentSemester.semester,
        tahunAjaran: currentSemester.tahunAjaran,
      },
      attendances: deletedAttendances.count,
      permissions: deletedPermissions.count,
      cutoff: cutoff.toISOString(),
    };
  }
}

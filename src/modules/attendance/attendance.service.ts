import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { AttendancePermissionsService } from './attendance-permissions.service';
import { isWithinRange, jakartaMinutes } from '../../common/utils/jakarta-time';

const PRESENT: AttendanceStatus[] = ['HADIR', 'TERLAMBAT'];

function parseDateKey(date: string): Date {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (isNaN(d.getTime())) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Tanggal tidak valid.',
    });
  }
  return d;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: AttendancePermissionsService,
  ) {}

  private assertScopeKelas(user: SessionUser, kelasId: string) {
    if (user.role === Role.KETUA_KELAS) {
      if (!user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Akun Ketua Kelas belum ditugaskan ke kelas.',
        });
      }
      if (kelasId !== user.kelasId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Anda hanya dapat mengakses presensi kelas Anda.',
        });
      }
    }
  }

  /** Cek apakah Ketua Kelas boleh catat HADIR/TERLAMBAT sekarang */
  private async isPresentWindowOpen(dateStr: string): Promise<boolean> {
    // Cek tanggal harus hari ini (Ketua Kelas hanya bisa catat hari berjalan)
    const today = new Date();
    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(today);
    if (dateStr !== todayKey) {
      return false; // Hanya hari berjalan
    }

    const schedules = await this.prisma.schedule.findMany();
    const now = jakartaMinutes();
    return schedules.some(
      (s) => !s.terkunci && isWithinRange(now, s.mulai, s.selesai),
    );
  }

  async findByClassAndDate(query: QueryAttendanceDto, user: SessionUser) {
    this.assertScopeKelas(user, query.kelasId);

    const kelas = await this.prisma.class.findUnique({
      where: { id: query.kelasId },
    });
    if (!kelas) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan.',
      });
    }

    const dateObj = parseDateKey(query.date);

    const [students, attendances, permissions, schedules] =
      await this.prisma.$transaction([
        this.prisma.student.findMany({
          where: { kelasId: query.kelasId, status: 'active' },
          orderBy: { nis: 'asc' },
          select: { id: true, nis: true, nama: true },
        }),
        this.prisma.attendance.findMany({
          where: { kelasId: query.kelasId, date: dateObj },
        }),
        this.prisma.attendancePermission.findMany({
          where: { kelasId: query.kelasId, date: dateObj },
        }),
        this.prisma.schedule.findMany(),
      ]);

    const byStudent = new Map(attendances.map((a) => [a.studentId, a]));
    const permByStudent = new Map(permissions.map((p) => [p.studentId, p]));

    const now = jakartaMinutes();
    const activeSession = schedules.find(
      (s) => !s.terkunci && isWithinRange(now, s.mulai, s.selesai),
    );

    const records = students.map((s) => {
      const a = byStudent.get(s.id);
      const p = permByStudent.get(s.id);
      return {
        studentId: s.id,
        nis: s.nis,
        nama: s.nama,
        status: a?.status ?? null,
        waktu: a?.waktu ?? null,
        keterangan: a?.keterangan ?? '',
        attendanceId: a?.id ?? null,
        izinHadir: p && !p.usedAt ? true : false,
      };
    });

    return {
      kelas: { id: kelas.id, nama: kelas.nama, jurusan: kelas.jurusan },
      date: query.date,
      records,
      summary: {
        total: records.length,
        filled: records.filter((r) => r.status !== null).length,
        belum: records.filter((r) => r.status === null).length,
      },
      activeSession: activeSession
        ? { session: activeSession.session, mulai: activeSession.mulai, selesai: activeSession.selesai }
        : null,
      canMarkPresentDirectly: !!activeSession,
    };
  }

  async saveBatch(
    classId: string,
    date: string,
    dto: SaveAttendanceDto,
    user: SessionUser,
  ) {
    this.assertScopeKelas(user, classId);

    const kelas = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!kelas) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Kelas tidak ditemukan.',
      });
    }

    const dateObj = parseDateKey(date);

    // Ambil siswa aktif di kelas
    const students = await this.prisma.student.findMany({
      where: { kelasId: classId, status: 'active' },
      select: { id: true, nis: true },
    });
    const byNis = new Map(students.map((s) => [s.nis, s.id]));

    // Validasi record
    const errors: Record<string, string> = {};
    for (const r of dto.records) {
      const studentId = byNis.get(r.nis);
      if (!studentId) {
        errors[r.nis] = `Siswa NIS ${r.nis} tidak aktif di kelas ini.`;
        continue;
      }
      if (PRESENT.includes(r.status) && !r.waktu) {
        errors[r.nis] = `Status ${r.status} wajib mengisi waktu.`;
      }
      if (!PRESENT.includes(r.status) && r.waktu) {
        errors[r.nis] = `Status ${r.status} tidak boleh mengisi waktu.`;
      }
    }
    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Ada data yang tidak valid.',
        fieldErrors: errors,
      });
    }

    // ============================================================
    // Aturan jadwal + izin untuk Ketua Kelas (HADIR/TERLAMBAT)
    // ============================================================
    if (user.role === Role.KETUA_KELAS) {
      const presentRecords = dto.records.filter((r) =>
        PRESENT.includes(r.status),
      );
      if (presentRecords.length > 0) {
        const windowOpen = await this.isPresentWindowOpen(date);

        for (const r of presentRecords) {
          if (windowOpen) continue; // OK, sesi buka

          // Sesi tutup/di luar jam → cek izin GP
          const studentId = byNis.get(r.nis)!;
          const consumed = await this.permissionsService.consumeIfExists(
            classId,
            studentId,
            dateObj,
            user.id,
          );
          if (!consumed) {
            throw new ForbiddenException({
              code: 'FORBIDDEN',
              message:
                `Status ${r.status} untuk NIS ${r.nis} hanya bisa dicatat di dalam sesi presensi ` +
                `atau dengan izin Guru Piket.`,
            });
          }
        }
      }
    }

    // Simpan
    const results = await this.prisma.$transaction(
      dto.records.map((r) => {
        const studentId = byNis.get(r.nis)!;
        return this.prisma.attendance.upsert({
          where: {
            date_kelasId_studentId: {
              date: dateObj,
              kelasId: classId,
              studentId,
            },
          },
          update: {
            status: r.status,
            waktu: r.waktu ?? null,
            keterangan: r.keterangan ?? '',
            updatedById: user.id,
          },
          create: {
            date: dateObj,
            kelasId: classId,
            studentId,
            status: r.status,
            waktu: r.waktu ?? null,
            keterangan: r.keterangan ?? '',
            createdById: user.id,
            updatedById: user.id,
          },
        });
      }),
    );

    return { saved: results.length, records: results };
  }

  async update(id: string, dto: UpdateAttendanceDto, user: SessionUser) {
    const att = await this.prisma.attendance.findUnique({ where: { id } });
    if (!att) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Catatan presensi tidak ditemukan.',
      });
    }

    this.assertScopeKelas(user, att.kelasId);

    const newStatus = dto.status ?? att.status;
    const newWaktu = dto.waktu !== undefined ? dto.waktu : att.waktu;

    if (PRESENT.includes(newStatus) && !newWaktu) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Status ${newStatus} wajib mengisi waktu.`,
      });
    }
    if (!PRESENT.includes(newStatus) && newWaktu) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Status ${newStatus} tidak boleh mengisi waktu.`,
      });
    }

    // Aturan jadwal + izin untuk Ketua Kelas (kalau ubah ke HADIR/TERLAMBAT)
    if (
      user.role === Role.KETUA_KELAS &&
      dto.status &&
      PRESENT.includes(dto.status)
    ) {
      const dateStr = att.date.toISOString().slice(0, 10);
      const windowOpen = await this.isPresentWindowOpen(dateStr);
      if (!windowOpen) {
        const consumed = await this.permissionsService.consumeIfExists(
          att.kelasId,
          att.studentId,
          att.date,
          user.id,
        );
        if (!consumed) {
          throw new ForbiddenException({
            code: 'FORBIDDEN',
            message:
              `Status ${dto.status} hanya bisa dicatat di dalam sesi ` +
              `atau dengan izin Guru Piket.`,
          });
        }
      }
    }

    return this.prisma.attendance.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.waktu !== undefined ? { waktu: dto.waktu } : {}),
        ...(dto.keterangan !== undefined ? { keterangan: dto.keterangan } : {}),
        updatedById: user.id,
      },
    });
  }

  async remove(id: string, user: SessionUser) {
    const att = await this.prisma.attendance.findUnique({ where: { id } });
    if (!att) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Catatan presensi tidak ditemukan.',
      });
    }
    this.assertScopeKelas(user, att.kelasId);
    await this.prisma.attendance.delete({ where: { id } });
    return { deleted: true, id };
  }
}

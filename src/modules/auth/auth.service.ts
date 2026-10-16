import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import type { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Login: verifikasi email + password.
   * Return session token (akan di-set sebagai cookie oleh controller).
   */
  async login(dto: LoginDto, userAgent?: string, ipAddress?: string): Promise<{
    token: string;
    user: SessionUser;
    expiresAt: Date;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      this.logger.warn(`Login gagal: email tidak ditemukan (${dto.email})`);
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Email atau password salah.',
      });
    }

    if (user.status !== 'active') {
      this.logger.warn(`Login gagal: akun nonaktif (${dto.email})`);
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Akun tidak aktif. Hubungi Admin sekolah.',
      });
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      this.logger.warn(`Login gagal: password salah (${dto.email})`);
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Email atau password salah.',
      });
    }

    // Generate random session token (64 bytes hex = 128 chars)
    const rawToken = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const maxAgeMs = parseInt(process.env.SESSION_MAX_AGE_MS ?? '28800000', 10);
    const expiresAt = new Date(Date.now() + maxAgeMs);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        userAgent: userAgent ?? null,
        ipAddress: ipAddress ?? null,
        expiresAt,
      },
    });

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      nama: user.nama,
      role: user.role,
      kelasId: user.kelasId,
    };

    this.logger.log(`Login sukses: ${user.email} (${user.role})`);

    return { token: rawToken, user: sessionUser, expiresAt };
  }

  /**
   * Validasi session token dari cookie.
   * Return SessionUser atau null kalau tidak valid / expired.
   */
  async validateSession(rawToken: string): Promise<SessionUser | null> {
    const tokenHash = this.hashToken(rawToken);

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            nama: true,
            role: true,
            kelasId: true,
            status: true,
          },
        },
      },
    });

    if (!session) return null;

    if (session.expiresAt < new Date()) {
      // Sesi expired, hapus
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }

    if (session.user.status !== 'active') {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      nama: session.user.nama,
      role: session.user.role,
      kelasId: session.user.kelasId,
    };
  }

  /**
   * Logout: hapus sesi dari database.
   */
  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin minta reset. Generate token, simpan hash, "kirim" ke user.
   * Di dev: log token ke console. Di prod: kirim via email.
   */
  async requestReset(userId: string): Promise<{ accepted: true; devToken?: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Akun tidak ditemukan.',
      });
    }

    // Generate token (32 bytes hex = 64 chars)
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 jam

    // Hapus token lama yang belum dipakai
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId, usedAt: null },
    });

    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    // TODO prod: kirim via email
    this.logger.warn(`[DEV] Password reset token untuk ${user.email}: ${rawToken}`);
    this.logger.warn(
      `[DEV] Konfirmasi via: POST /api/v1/auth/password-reset/confirm { "token": "${rawToken}", "newPassword": "..." }`,
    );

    const isDev = process.env.NODE_ENV !== 'production';
    return {
      accepted: true,
      ...(isDev ? { devToken: rawToken } : {}),
    };
  }

  /**
   * User konfirmasi reset dengan token + password baru.
   */
  async confirmReset(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!token) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Token tidak valid.',
      });
    }

    if (token.usedAt) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Token sudah digunakan.',
      });
    }

    if (token.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Token sudah kedaluwarsa. Minta Admin reset ulang.',
      });
    }

    if (token.user.status !== 'active') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Akun tidak aktif.',
      });
    }

    const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
    const passwordHash = await bcrypt.hash(newPassword, rounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate semua sesi user
      this.prisma.session.deleteMany({ where: { userId: token.userId } }),
    ]);

    this.logger.log(`Password reset berhasil untuk ${token.user.email}. Semua sesi dihapus.`);
  }
}

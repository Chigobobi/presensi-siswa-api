import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuditResult } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import type { LoginDto } from './dto/login.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async login(
    dto: LoginDto,
    userAgent?: string,
    ipAddress?: string,
    requestId?: string,
  ): Promise<{ token: string; user: SessionUser; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      this.logger.warn(`Login gagal: email tidak ditemukan (${dto.email})`);
      await this.audit.log({
        actorId: null,
        action: 'auth.login',
        objectType: 'Auth',
        result: AuditResult.FAILURE,
        metadata: { email: dto.email, reason: 'email_not_found' },
        requestId: requestId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Email atau password salah.',
      });
    }

    if (user.status !== 'active') {
      await this.audit.log({
        actorId: user.id,
        action: 'auth.login',
        objectType: 'Auth',
        objectId: user.id,
        result: AuditResult.FAILURE,
        metadata: { reason: 'inactive' },
        requestId: requestId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Akun tidak aktif. Hubungi Admin sekolah.',
      });
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      await this.audit.log({
        actorId: user.id,
        action: 'auth.login',
        objectType: 'Auth',
        objectId: user.id,
        result: AuditResult.FAILURE,
        metadata: { reason: 'wrong_password' },
        requestId: requestId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Email atau password salah.',
      });
    }

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

    await this.audit.log({
      actorId: user.id,
      action: 'auth.login',
      objectType: 'Auth',
      objectId: user.id,
      result: AuditResult.SUCCESS,
      metadata: { role: user.role },
      requestId: requestId ?? null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    this.logger.log(`Login sukses: ${user.email} (${user.role})`);
    return { token: rawToken, user: sessionUser, expiresAt };
  }

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
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    if (session.user.status !== 'active') return null;
    return {
      id: session.user.id,
      email: session.user.email,
      nama: session.user.nama,
      role: session.user.role,
      kelasId: session.user.kelasId,
    };
  }

  async logout(
    rawToken: string,
    userId: string,
    requestId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.session.deleteMany({ where: { tokenHash } });
    await this.audit.log({
      actorId: userId,
      action: 'auth.logout',
      objectType: 'Auth',
      objectId: userId,
      result: AuditResult.SUCCESS,
      requestId: requestId ?? null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}

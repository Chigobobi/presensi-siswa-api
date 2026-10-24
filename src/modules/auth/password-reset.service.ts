import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActiveStatus, AuditResult } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionUser } from '../../common/types/session-user.type';
import { AuditService } from '../audit/audit.service';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';

interface AuditCtx {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async log(
    actorId: string | null,
    ctx: AuditCtx,
    action: string,
    objectId: string | null,
    result: AuditResult,
    metadata: Record<string, unknown>,
  ) {
    await this.audit.log({
      actorId,
      action,
      objectType: 'User',
      objectId,
      result,
      metadata,
      requestId: ctx.requestId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }

  async request(dto: RequestPasswordResetDto, user: SessionUser, ctx: AuditCtx = {}) {
    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!target) {
      await this.log(user.id, ctx, 'user.password_reset.request', dto.userId, AuditResult.FAILURE, {
        reason: 'NOT_FOUND',
      });
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Akun tidak ditemukan.',
      });
    }

    if (target.status !== ActiveStatus.active) {
      await this.log(user.id, ctx, 'user.password_reset.request', target.id, AuditResult.FAILURE, {
        reason: 'INACTIVE',
        email: target.email,
      });
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Akun tidak aktif, tidak dapat reset password.',
      });
    }

    // Invalidasi token lama yang belum dipakai
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: target.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 jam

    const created = await this.prisma.passwordResetToken.create({
      data: {
        userId: target.id,
        tokenHash,
        expiresAt,
      },
    });

    await this.log(user.id, ctx, 'user.password_reset.request', target.id, AuditResult.SUCCESS, {
      email: target.email,
      tokenId: created.id,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      tokenId: created.id,
      expiresAt: created.expiresAt,
      // HATI-HATI: jangan ekspos token di produksi!
      ...(process.env.NODE_ENV !== 'production' ? { token: rawToken } : {}),
    };
  }

  async confirm(dto: ConfirmPasswordResetDto, ctx: AuditCtx = {}) {
    const tokenHash = this.hashToken(dto.token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record) {
      await this.log(null, ctx, 'user.password_reset.confirm', null, AuditResult.FAILURE, {
        reason: 'INVALID_TOKEN',
      });
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Token reset tidak valid.',
        fieldErrors: { token: 'Token tidak valid.' },
      });
    }

    if (record.usedAt) {
      await this.log(
        record.userId,
        ctx,
        'user.password_reset.confirm',
        record.userId,
        AuditResult.FAILURE,
        { reason: 'TOKEN_USED', tokenId: record.id },
      );
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Token reset sudah pernah digunakan.',
        fieldErrors: { token: 'Token sudah dipakai.' },
      });
    }

    if (record.expiresAt < new Date()) {
      await this.log(
        record.userId,
        ctx,
        'user.password_reset.confirm',
        record.userId,
        AuditResult.FAILURE,
        { reason: 'TOKEN_EXPIRED', tokenId: record.id },
      );
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Token reset sudah kedaluwarsa.',
        fieldErrors: { token: 'Token kedaluwarsa.' },
      });
    }

    if (record.user.status !== ActiveStatus.active) {
      await this.log(
        record.userId,
        ctx,
        'user.password_reset.confirm',
        record.userId,
        AuditResult.FAILURE,
        { reason: 'INACTIVE', tokenId: record.id },
      );
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Akun tidak aktif.',
      });
    }

    const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.deleteMany({ where: { userId: record.userId } }),
    ]);

    await this.log(
      record.userId,
      ctx,
      'user.password_reset.confirm',
      record.userId,
      AuditResult.SUCCESS,
      { email: record.user.email, tokenId: record.id },
    );

    return { reset: true, userId: record.userId };
  }
}

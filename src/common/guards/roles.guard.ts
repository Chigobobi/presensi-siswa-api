import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { SessionUser } from '../types/session-user.type';
import { AuthService } from '../../modules/auth/auth.service';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Tidak ada @Roles → izinkan (AuthGuard yang handle sesi)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    const url = request.url;

    // Coba ambil user dari request (kalau AuthGuard sudah jalan duluan)
    let user = (request as Request & { user?: SessionUser }).user;

    // Kalau belum ada, baca session langsung dari cookie
    // (supaya RolesGuard global bisa jalan SEBELUM AuthGuard lokal)
    if (!user) {
      const cookies = request.cookies as Record<string, string> | undefined;
      const cookieName = process.env.SESSION_COOKIE_NAME ?? 'presensi_session';
      const token = cookies?.[cookieName];

      if (token) {
        const sessionUser = await this.authService.validateSession(token);
        if (sessionUser) {
          user = sessionUser;
          // Set ke request agar AuthGuard/handler tidak query ulang
          (request as Request & { user?: SessionUser }).user = sessionUser;
        }
      }
    }

    this.logger.debug(
      `[RolesGuard] ${method} ${url} | requiredRoles=${JSON.stringify(requiredRoles)} | userRole=${user?.role ?? 'NONE'} | user=${user?.email ?? 'NONE'}`,
    );

    // Belum login
    if (!user) {
      this.logger.warn(`[RolesGuard] No user on ${method} ${url} (ditolak)`);
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Akses ditolak.',
      });
    }

    // Admin selalu lolos (superuser)
    if (user.role === 'ADMIN') {
      return true;
    }

    // Role tidak sesuai
    if (!requiredRoles.includes(user.role)) {
      this.logger.warn(
        `[RolesGuard] Role ${user.role} not in [${requiredRoles.join(', ')}] for ${method} ${url} (ditolak)`,
      );
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Anda tidak memiliki izin untuk tindakan ini.',
      });
    }

    return true;
  }
}

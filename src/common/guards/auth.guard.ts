import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service';
import type { SessionUser } from '../types/session-user.type';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractSessionToken(request);

    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Sesi tidak ditemukan. Silakan login.',
      });
    }

    const user = await this.authService.validateSession(token);
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Sesi tidak valid atau sudah berakhir. Silakan login ulang.',
      });
    }

    (request as Request & { user?: SessionUser }).user = user;
    return true;
  }

  private extractSessionToken(request: Request): string | null {
    const cookies = request.cookies as Record<string, string> | undefined;
    const cookieName = process.env.SESSION_COOKIE_NAME ?? 'presensi_session';
    return cookies?.[cookieName] ?? null;
  }
}

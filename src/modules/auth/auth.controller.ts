import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReqContext, type RequestContext } from '../../common/decorators/request-context.decorator';
import type { SessionUser } from '../../common/types/session-user.type';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login dengan email & password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUser> {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip ?? req.socket.remoteAddress;

    const { token, user, expiresAt } = await this.authService.login(
      dto,
      userAgent,
      ipAddress,
      ctx.requestId ?? undefined,
    );

    const cookieName = process.env.SESSION_COOKIE_NAME ?? 'presensi_session';
    const secure = process.env.NODE_ENV === 'production';
    const sameSite = (process.env.SESSION_SAME_SITE ?? 'lax') as 'lax' | 'strict' | 'none';

    res.cookie(cookieName, token, {
      httpOnly: true,
      secure,
      sameSite,
      expires: expiresAt,
      path: '/',
    });

    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Logout (hapus sesi)' })
  async logout(
    @Req() req: Request,
    @ReqContext() ctx: RequestContext,
    @CurrentUser() user: SessionUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const cookieName = process.env.SESSION_COOKIE_NAME ?? 'presensi_session';
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = cookies?.[cookieName];

    if (token && user) {
      await this.authService.logout(
        token,
        user.id,
        ctx.requestId ?? undefined,
        ctx.ipAddress ?? undefined,
        ctx.userAgent ?? undefined,
      );
    }

    res.clearCookie(cookieName, { path: '/' });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('session')
  @ApiOperation({ summary: 'Baca sesi saat ini' })
  me(@CurrentUser() user: SessionUser | undefined): SessionUser {
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Sesi tidak ditemukan.',
      });
    }
    return user;
  }
}

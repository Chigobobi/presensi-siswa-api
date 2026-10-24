import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestContext {
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Ambil konteks request: requestId, IP, user-agent.
 * Dipakai untuk audit log.
 */
export const ReqContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const requestId = (req as Request & { requestId?: string }).requestId ?? null;
    return {
      requestId,
      ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };
  },
);

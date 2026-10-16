import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string | null;
  fieldErrors?: Record<string, string>;
}

/** Deteksi Prisma error tanpa import runtime, aman sebelum `prisma generate`. */
interface PrismaLikeError {
  name: string;
  code?: string;
  meta?: Record<string, unknown>;
}

function isPrismaKnownError(err: unknown): err is PrismaLikeError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'PrismaClientKnownRequestError' &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string'
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as { requestId?: string }).requestId ?? null;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'SERVER_ERROR';
    let message = 'Terjadi kendala pada server. Coba lagi beberapa saat.';
    let fieldErrors: Record<string, string> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as {
          message?: string | string[];
          code?: string;
          fieldErrors?: Record<string, string>;
        };
        message = Array.isArray(obj.message) ? obj.message.join(', ') : (obj.message ?? message);
        code = obj.code ?? this.mapStatusToCode(status);
        if (obj.fieldErrors) fieldErrors = obj.fieldErrors;
      }
      if (!code || code === 'SERVER_ERROR') code = this.mapStatusToCode(status);
    } else if (isPrismaKnownError(exception)) {
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          code = 'CONFLICT';
          message = 'Data sudah ada. Periksa kembali input Anda.';
          const target = (exception.meta?.target as string[] | undefined) ?? [];
          if (target.length > 0) {
            fieldErrors = { [target[0]]: `Nilai ${target[0]} sudah digunakan.` };
          }
          break;
        }
        case 'P2025': {
          status = HttpStatus.NOT_FOUND;
          code = 'NOT_FOUND';
          message = 'Data tidak ditemukan.';
          break;
        }
        case 'P2003': {
          status = HttpStatus.CONFLICT;
          code = 'CONFLICT';
          message = 'Data masih terkait dengan data lain.';
          break;
        }
        default: {
          this.logger.error(
            `Prisma error ${exception.code} on ${request.method} ${request.url}`,
            JSON.stringify(exception.meta ?? {}),
          );
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          code = 'SERVER_ERROR';
          message = 'Terjadi kendala pada server. Coba lagi beberapa saat.';
        }
      }
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorBody = { code, message, requestId };
    if (fieldErrors) body.fieldErrors = fieldErrors;

    response.status(status).json(body);
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHENTICATED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_ERROR';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR';
    }
  }
}

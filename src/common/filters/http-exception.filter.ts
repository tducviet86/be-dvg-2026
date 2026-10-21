import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { MovedError, type ErrorCode } from '../errors.js';

const statusCodes: Partial<Record<number, ErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA',
  423: 'ACCOUNT_LOCKED',
  429: 'RATE_LIMITED',
};

/**
 * Every error leaves the API as
 * `{ error: { code, message, details?, requestId } }`; internals are logged,
 * never returned.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'INTERNAL';
    let message = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';
    let details: unknown;

    if (exception instanceof ThrottlerException) {
      status = 429;
      code = 'RATE_LIMITED';
      message = 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = statusCodes[status] ?? (status >= 500 ? 'INTERNAL' : 'BAD_REQUEST');
      if (typeof body === 'string') message = body;
      else if (body && typeof body === 'object') {
        const value = body as Record<string, unknown>;
        if (typeof value.code === 'string') code = value.code as ErrorCode;
        if (Array.isArray(value.message)) {
          code = 'VALIDATION_FAILED';
          message = 'Dữ liệu gửi lên chưa hợp lệ.';
          details = value.message;
        } else if (typeof value.message === 'string') message = value.message;
        if (value.details !== undefined) details = value.details;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = 409;
        code = 'CONFLICT';
        message = 'Giá trị đã tồn tại (ví dụ đường dẫn bị trùng).';
        details = { fields: exception.meta?.target };
      } else if (exception.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        message = 'Không tìm thấy dữ liệu.';
      } else if (exception.code === 'P2003') {
        status = 409;
        code = 'CONFLICT';
        message = 'Dữ liệu đang được tham chiếu bởi bản ghi khác.';
      }
    }
    if (exception instanceof MovedError) res.setHeader('Location', exception.location);
    if (status >= 500)
      this.logger.error(
        { err: exception, requestId: req.id, path: req.url },
        'Unhandled error',
      );
    res.status(status).json({
      error: { code, message, ...(details === undefined ? {} : { details }), requestId: req.id },
    });
  }
}

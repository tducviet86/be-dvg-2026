import { HttpException, HttpStatus } from '@nestjs/common';

/** Stable machine-readable error codes returned in `error.code`. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CSRF_INVALID'
  | 'NOT_FOUND'
  | 'GONE'
  | 'MOVED_PERMANENTLY'
  | 'CONFLICT'
  | 'STALE_RECORD'
  | 'ACCOUNT_LOCKED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA'
  | 'RATE_LIMITED'
  | 'AI_DISABLED'
  | 'AI_UNAVAILABLE'
  | 'INTERNAL';

export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const notFound = (message = 'Không tìm thấy dữ liệu.') =>
  new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', message);
export const conflict = (message: string, details?: unknown) =>
  new AppError(HttpStatus.CONFLICT, 'CONFLICT', message, details);
export const badRequest = (message: string, details?: unknown) =>
  new AppError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', message, details);
export const stale = () =>
  new AppError(
    HttpStatus.CONFLICT,
    'STALE_RECORD',
    'Bản ghi đã được thay đổi ở nơi khác. Hãy tải lại trước khi lưu.',
  );

/** Old slug: answered with 301 + Location and `details.slug`. */
export class MovedError extends AppError {
  constructor(
    readonly location: string,
    slug: string,
  ) {
    super(HttpStatus.MOVED_PERMANENTLY, 'MOVED_PERMANENTLY', 'Đường dẫn đã thay đổi.', { slug });
  }
}
export const gone = () =>
  new AppError(HttpStatus.GONE, 'GONE', 'Nội dung đã ngừng hiển thị.');
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này.') =>
  new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);

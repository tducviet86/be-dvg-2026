import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import {
  IS_PUBLIC,
  PERMISSIONS,
} from '../../common/decorators/auth.decorators.js';
import { AppError } from '../../common/errors.js';
import { AuthService } from './auth.service.js';
import { ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER } from './cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfValid(req: Request) {
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.header(CSRF_HEADER);
  if (typeof cookie !== 'string' || !cookie || !header) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Global guard: authenticates every non-@Public route (cookie or Bearer),
 * enforces double-submit CSRF for cookie sessions on unsafe methods, then
 * checks @RequirePermissions.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets))
      return true;
    const req = context.switchToHttp().getRequest<Request>();
    const bearer = req.header('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    const cookie = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    const user =
      (bearer && (await this.auth.verifyAccess(bearer, 'bearer'))) ||
      (cookie && (await this.auth.verifyAccess(cookie, 'cookie'))) ||
      null;
    if (!user)
      throw new AppError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Vui lòng đăng nhập.',
      );
    if (user.via === 'cookie' && !SAFE_METHODS.has(req.method) && !csrfValid(req))
      throw new AppError(
        HttpStatus.FORBIDDEN,
        'CSRF_INVALID',
        'Phiên làm việc không hợp lệ. Hãy tải lại trang.',
      );
    (req as Request & { user: unknown }).user = user;
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS, targets) ?? [];
    if (!required.every((p) => user.permissions.includes(p)))
      throw new AppError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Bạn không có quyền thực hiện thao tác này.',
      );
    return true;
  }
}

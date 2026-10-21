import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { AuthUser } from '../../modules/auth/auth.types.js';

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS = 'permissions';
/** Route needs no authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route requires every listed permission. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS, permissions);
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);

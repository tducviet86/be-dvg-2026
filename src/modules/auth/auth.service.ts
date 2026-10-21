import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppConfig } from '../../config/config.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AppError } from '../../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from './auth.types.js';

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // OWASP minimum profile (19 MiB, t=2, p=1)
  timeCost: 2,
  parallelism: 1,
} satisfies argon2.HashOptions;
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
/** Refresh requests racing within this window are not treated as theft. */
const ROTATION_GRACE_MS = 10_000;

type Context = { ip?: string; userAgent?: string };
const unauthenticated = (message = 'Phiên đăng nhập không hợp lệ.') =>
  new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', message);

@Injectable()
export class AuthService {
  /** Used to keep timing similar when the e-mail does not exist. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { ...ARGON2_OPTIONS, raw: false });
  }

  async login(email: string, password: string, ctx: Context) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (!user) {
      this.dummyHash ??= this.hashPassword(randomUUID());
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      await this.audit.log({
        action: 'auth.login_failed',
        changes: { reason: 'unknown_email' },
        ip: ctx.ip,
      });
      throw unauthenticated('Email hoặc mật khẩu không đúng.');
    }
    if (user.lockedUntil && user.lockedUntil > new Date())
      throw new AppError(
        HttpStatus.LOCKED,
        'ACCOUNT_LOCKED',
        'Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.',
      );
    const valid = await argon2
      .verify(user.passwordHash, password)
      .catch(() => false);
    if (!valid || user.status !== 'ACTIVE') {
      const attempts = user.failedLoginCount + 1;
      const lock = attempts >= this.config.get('LOGIN_MAX_ATTEMPTS');
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : attempts,
          lockedUntil: lock
            ? new Date(Date.now() + this.config.get('LOGIN_LOCK_MINUTES') * 60_000)
            : undefined,
        },
      });
      await this.audit.log({
        actorId: user.id,
        action: lock ? 'auth.account_locked' : 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        ip: ctx.ip,
      });
      throw unauthenticated('Email hoặc mật khẩu không đúng.');
    }
    const { type: _type, ...cost } = ARGON2_OPTIONS;
    if (argon2.needsRehash(user.passwordHash, cost))
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.hashPassword(password) },
      });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const tokens = await this.issue(user.id, randomUUID(), ctx);
    await this.audit.log({
      actorId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ip: ctx.ip,
    });
    return { ...tokens, user: await this.profile(user.id, tokens.sessionId) };
  }

  /** Rotates the refresh token; reuse of a rotated token revokes the family. */
  async refresh(refreshToken: string | undefined, ctx: Context) {
    if (!refreshToken) throw unauthenticated();
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!session) throw unauthenticated();
    if (session.rotatedAt || session.revokedAt) {
      const benignRace =
        session.rotatedAt &&
        !session.revokedAt &&
        Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS;
      if (!benignRace) {
        await this.prisma.session.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await this.audit.log({
          actorId: session.userId,
          action: 'auth.refresh_reuse_detected',
          entityType: 'session',
          entityId: session.familyId,
          ip: ctx.ip,
        });
      }
      throw unauthenticated();
    }
    if (session.expiresAt < new Date() || session.user.status !== 'ACTIVE')
      throw unauthenticated();
    await this.prisma.session.update({
      where: { id: session.id },
      data: { rotatedAt: new Date() },
    });
    const tokens = await this.issue(session.userId, session.familyId, ctx);
    return {
      ...tokens,
      user: await this.profile(session.userId, tokens.sessionId),
    };
  }

  async logout(sessionId: string | undefined, refreshToken?: string) {
    const where = refreshToken
      ? { refreshTokenHash: sha256(refreshToken) }
      : sessionId
        ? { id: sessionId }
        : null;
    if (!where) return;
    const session = await this.prisma.session.findFirst({ where });
    if (!session) return;
    await this.prisma.session.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      actorId: session.userId,
      action: 'auth.logout',
      entityType: 'session',
      entityId: session.familyId,
    });
  }

  /** Resolves an access token into the current user, checking the session. */
  async verifyAccess(
    accessToken: string,
    via: AuthUser['via'],
  ): Promise<AuthUser | null> {
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(accessToken);
    } catch {
      return null;
    }
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { userId: true, revokedAt: true, expiresAt: true },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt < new Date()
    )
      return null;
    const profile = await this.profile(payload.sub, payload.sid);
    return profile ? { ...profile, via } : null;
  }

  async profile(userId: string, sessionId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });
    if (!user || user.status !== 'ACTIVE') return null;
    const roles = user.roles.map((r) => r.role.code);
    const permissions = [
      ...new Set(
        user.roles.flatMap((r) =>
          r.role.permissions.map((p) => p.permission.code),
        ),
      ),
    ].sort();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      sessionId,
      roles,
      permissions,
      via: 'cookie' as const,
    };
  }

  private async issue(userId: string, familyId: string, ctx: Context) {
    const refresh = token();
    const refreshExpires = new Date(
      Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS') * 86_400_000,
    );
    const session = await this.prisma.session.create({
      data: {
        userId,
        familyId,
        refreshTokenHash: sha256(refresh),
        expiresAt: refreshExpires,
        ip: ctx.ip,
        userAgent: ctx.userAgent?.slice(0, 300),
      },
    });
    const access = await this.jwt.signAsync(
      { sub: userId, sid: session.id },
      { expiresIn: this.config.get('ACCESS_TOKEN_TTL_SECONDS') },
    );
    return { access, refresh, refreshExpires, csrf: token(), sessionId: session.id };
  }
}

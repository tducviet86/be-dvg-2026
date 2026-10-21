import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { createApp, createUser, login, PASSWORD, resetDb } from './helpers.js';

let app: NestExpressApplication;
let prisma: PrismaService;
let http: () => request.Agent | ReturnType<typeof request>;

beforeAll(async () => {
  ({ app, prisma, http } = await createApp());
});
beforeEach(async () => {
  await resetDb(prisma);
  await createUser(prisma, 'admin@dvg.test', 'admin');
});
afterAll(() => app.close());

const cookies = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []);

describe('auth', () => {
  it('logs in with httpOnly SameSite=Strict cookies and never returns secrets', async () => {
    const res = await http().post('/api/v1/auth/login').send({ email: 'ADMIN@dvg.test', password: PASSWORD }).expect(200);
    const set = cookies(res);
    expect(set.find((c) => c.startsWith('dvg_at='))).toMatch(/HttpOnly/i);
    expect(set.find((c) => c.startsWith('dvg_at='))).toMatch(/SameSite=Strict/i);
    expect(set.find((c) => c.startsWith('dvg_rt='))).toMatch(/Path=\/api\/v1\/auth/);
    expect(set.find((c) => c.startsWith('dvg_csrf='))).not.toMatch(/HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refresh/i);
    expect(res.body.data.user.permissions).toContain('users:manage');
  });

  it('rejects wrong passwords and unknown emails with the same message', async () => {
    const a = await http().post('/api/v1/auth/login').send({ email: 'admin@dvg.test', password: 'wrong-password' }).expect(401);
    const b = await http().post('/api/v1/auth/login').send({ email: 'nobody@dvg.test', password: 'wrong-password' }).expect(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('locks the account after repeated failures', async () => {
    for (let i = 0; i < 5; i++) await http().post('/api/v1/auth/login').send({ email: 'admin@dvg.test', password: 'nope-nope' }).expect(401);
    const locked = await http().post('/api/v1/auth/login').send({ email: 'admin@dvg.test', password: PASSWORD }).expect(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(await prisma.auditLog.count({ where: { action: 'auth.account_locked' } })).toBe(1);
  });

  it('requires the CSRF header for cookie-authenticated writes', async () => {
    const session = await login(app, 'admin@dvg.test');
    const res = await session.agent.put('/api/v1/admin/settings').send({ values: {} }).expect(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
    await session.put('/api/v1/admin/settings', { values: {} }).expect(200);
  });

  it('accepts a Bearer access token without CSRF (API clients)', async () => {
    const res = await http().post('/api/v1/auth/login').send({ email: 'admin@dvg.test', password: PASSWORD });
    const token = cookies(res).find((c) => c.startsWith('dvg_at='))!.split(';')[0].slice('dvg_at='.length);
    await http().get('/api/v1/auth/me').set('authorization', `Bearer ${token}`).expect(200);
    await http().get('/api/v1/auth/me').set('authorization', 'Bearer forged.token.value').expect(401);
  });

  it('rotates refresh tokens and revokes the family when an old token is replayed', async () => {
    const session = await login(app, 'admin@dvg.test');
    const original = cookies(session.res).find((c) => c.startsWith('dvg_rt='))!.split(';')[0];
    const first = await session.agent.post('/api/v1/auth/refresh').set('x-csrf-token', session.csrf).expect(200);
    const csrf = first.body.data.csrfToken;
    await session.agent.get('/api/v1/auth/me').expect(200);
    // Replay the original token well after the grace window.
    await prisma.session.updateMany({ where: { rotatedAt: { not: null } }, data: { rotatedAt: new Date(Date.now() - 60_000) } });
    await http().post('/api/v1/auth/refresh').set('Cookie', [original, `dvg_csrf=${csrf}`]).set('x-csrf-token', csrf).expect(401);
    expect(await prisma.auditLog.count({ where: { action: 'auth.refresh_reuse_detected' } })).toBe(1);
    // The legitimate session is now revoked too.
    await session.agent.get('/api/v1/auth/me').expect(401);
  });

  it('logout revokes the session', async () => {
    const session = await login(app, 'admin@dvg.test');
    await session.post('/api/v1/auth/logout').expect(204);
    await session.agent.get('/api/v1/auth/me').expect(401);
  });

  it('disabling a user ends their sessions immediately', async () => {
    const editor = await createUser(prisma, 'editor@dvg.test', 'editor');
    const editorSession = await login(app, 'editor@dvg.test');
    const admin = await login(app, 'admin@dvg.test');
    await admin.patch(`/api/v1/admin/users/${editor.id}`, { status: 'DISABLED' }).expect(200);
    await editorSession.get('/api/v1/auth/me').expect(401);
  });

  it('rate limits login attempts', async () => {
    process.env.TEST_THROTTLE = '1';
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await http().post('/api/v1/auth/login').send({ email: 'x@dvg.test', password: 'x' })).status);
      expect(statuses.at(-1)).toBe(429);
    } finally {
      delete process.env.TEST_THROTTLE;
    }
  });
});

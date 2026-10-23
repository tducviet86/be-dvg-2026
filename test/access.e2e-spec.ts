import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { createApp, createUser, login, resetDb } from './helpers.js';

let app: NestExpressApplication;
let prisma: PrismaService;
let http: () => ReturnType<typeof request>;

beforeAll(async () => {
  ({ app, prisma, http } = (await createApp()) as never);
  await resetDb(prisma);
  for (const role of ['admin', 'editor', 'sales']) await createUser(prisma, `${role}@dvg.test`, role);
});
afterAll(() => app.close());

const adminRoutes: [string, string][] = [
  ['get', '/api/v1/admin/projects'],
  ['post', '/api/v1/admin/projects'],
  ['get', '/api/v1/admin/banners'],
  ['post', '/api/v1/admin/banners'],
  ['get', '/api/v1/admin/properties'],
  ['get', '/api/v1/admin/blog/posts'],
  ['get', '/api/v1/admin/leads'],
  ['get', '/api/v1/admin/leads/export'],
  ['post', '/api/v1/admin/media/upload'],
  ['get', '/api/v1/admin/settings'],
  ['get', '/api/v1/admin/users'],
  ['get', '/api/v1/admin/audit-logs'],
  ['get', '/api/v1/auth/me'],
];

describe('authorization', () => {
  it.each(adminRoutes)('anonymous %s %s → 401', async (method, url) => {
    const res = await (http() as unknown as Record<string, (u: string) => request.Test>)[method](url).expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('sales staff can work on leads but not edit content, users or export', async () => {
    const sales = await login(app, 'sales@dvg.test');
    await sales.get('/api/v1/admin/leads').expect(200);
    await sales.post('/api/v1/admin/projects', {}).expect(403);
    await sales.get('/api/v1/admin/users').expect(403);
    await sales.get('/api/v1/admin/leads/export').expect(403);
  });

  it('editors manage content but not leads, users or settings', async () => {
    const editor = await login(app, 'editor@dvg.test');
    await editor.get('/api/v1/admin/projects').expect(200);
    await editor.get('/api/v1/admin/leads').expect(403);
    await editor.get('/api/v1/admin/users').expect(403);
    await editor.put('/api/v1/admin/settings', { values: {} }).expect(403);
  });

  it('staff phone numbers feed the unit contact list (editors can read it)', async () => {
    const admin = await login(app, 'admin@dvg.test');
    const users = (await admin.get('/api/v1/admin/users').expect(200)).body.data as { id: string; email: string }[];
    const sales = users.find((u) => u.email === 'sales@dvg.test')!;
    await admin.patch(`/api/v1/admin/users/${sales.id}`, { phone: 'abc' }).expect(400);
    const saved = await admin.patch(`/api/v1/admin/users/${sales.id}`, { phone: '0905 123 456' }).expect(200);
    expect(saved.body.data.phone).toBe('0905 123 456');
    const editor = await login(app, 'editor@dvg.test');
    const contacts = await editor.get('/api/v1/admin/users/contacts').expect(200);
    expect(contacts.body.data).toEqual([{ id: sales.id, name: expect.any(String), phone: '0905 123 456' }]);
    // Clearing the phone removes the person from the list.
    await admin.patch(`/api/v1/admin/users/${sales.id}`, { phone: '' }).expect(200);
    expect((await editor.get('/api/v1/admin/users/contacts').expect(200)).body.data).toEqual([]);
  });

  it('public settings never expose private keys', async () => {
    const admin = await login(app, 'admin@dvg.test');
    await admin.put('/api/v1/admin/settings', { values: { 'company.hotline': '0911 29 69 79', 'leads.notificationEmail': 'sales@dvg.test' } }).expect(200);
    const pub = await http().get('/api/v1/settings/public').expect(200);
    expect(pub.body.data).toEqual({ 'company.hotline': '0911 29 69 79' });
    await admin.put('/api/v1/admin/settings', { values: { 'not.a.key': 'x' } }).expect(400);
  });
});

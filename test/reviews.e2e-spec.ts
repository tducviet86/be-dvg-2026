import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { createApp, createUser, login, resetDb } from './helpers.js';

let app: NestExpressApplication;
let prisma: PrismaService;
let http: () => ReturnType<typeof request>;
beforeAll(async () => {
  ({ app, prisma, http } = (await createApp()) as never);
});
afterAll(() => app.close());

describe('reviews', () => {
  it('lets staff publish customer reviews that the website lists', async () => {
    await resetDb(prisma);
    await createUser(prisma, 'admin@dvg.test', 'admin');
    await createUser(prisma, 'sales@dvg.test', 'sales');
    const admin = await login(app, 'admin@dvg.test');
    const project = await prisma.project.create({ data: { slug: 'monarchy', name: 'The Monarchy', location: 'Đà Nẵng', intro: 'Dự án.' } });
    const base = { rating: 5, content: 'Tư vấn nhiệt tình, căn hộ đúng như ảnh.', reviewedAt: '2026-10-20', source: 'GOOGLE', sourceUrl: 'https://maps.app.goo.gl/abc' };
    const a = (await admin.post('/api/v1/admin/reviews', { ...base, authorName: 'Chị <b>Lan</b>', projectId: project.id }).expect(201)).body.data;
    await admin.post('/api/v1/admin/reviews', { ...base, authorName: 'Anh Minh', rating: 4, reviewedAt: '2026-10-25' }).expect(201);
    const hidden = (await admin.post('/api/v1/admin/reviews', { ...base, authorName: 'Ẩn', isPublished: false }).expect(201)).body.data;

    const all = (await http().get('/api/v1/reviews').expect(200)).body.data;
    // Newest first; hidden ones and tags left out.
    expect(all.map((r: { authorName: string }) => r.authorName)).toEqual(['Anh Minh', 'Chị Lan']);
    expect(all[1]).toMatchObject({ rating: 5, reviewedAt: '2026-10-20', project: { slug: 'monarchy' }, source: 'GOOGLE' });
    expect(all.find((r: { id: string }) => r.id === hidden.id)).toBeUndefined();
    // A project page gets its own reviews plus general ones.
    await prisma.project.create({ data: { slug: 'panoma', name: 'Sun Panoma', location: 'Đà Nẵng', intro: 'Dự án.' } });
    expect((await http().get('/api/v1/reviews?project=panoma').expect(200)).body.data.map((r: { authorName: string }) => r.authorName)).toEqual(['Anh Minh']);
    // Order by hand, hide, delete.
    await admin.patch(`/api/v1/admin/reviews/${a.id}`, { sortOrder: 0 }).expect(200);
    await prisma.review.updateMany({ where: { authorName: 'Anh Minh' }, data: { sortOrder: 5 } });
    expect((await http().get('/api/v1/reviews').expect(200)).body.data[0].authorName).toBe('Chị Lan');
    await admin.patch(`/api/v1/admin/reviews/${a.id}`, { isPublished: false }).expect(200);
    expect((await http().get('/api/v1/reviews').expect(200)).body.data).toHaveLength(1);
    expect((await admin.get('/api/v1/admin/reviews').expect(200)).body.data).toHaveLength(3);
    await admin.del(`/api/v1/admin/reviews/${hidden.id}`).expect(204);
    // Validation: stars 1–5, real text, https links only.
    await admin.post('/api/v1/admin/reviews', { ...base, authorName: 'X', rating: 6 }).expect(400);
    await admin.post('/api/v1/admin/reviews', { ...base, authorName: 'Khách', content: 'ngắn' }).expect(400);
    await admin.post('/api/v1/admin/reviews', { ...base, authorName: 'Khách', sourceUrl: 'javascript:alert(1)' }).expect(400);
    await admin.post('/api/v1/admin/reviews', { authorName: 'Khách', rating: 5 }).expect(400);
    // Sales can read but not write.
    const sales = await login(app, 'sales@dvg.test');
    await sales.get('/api/v1/admin/reviews').expect(200);
    await sales.post('/api/v1/admin/reviews', { ...base, authorName: 'Khách' }).expect(403);
    // Google summary settings are public.
    await admin.put('/api/v1/admin/settings', { values: { 'reviews.googleRating': '4.9', 'reviews.googleCount': '23', 'reviews.googleUrl': 'https://g.page/r/abc' } }).expect(200);
    expect((await http().get('/api/v1/settings/public').expect(200)).body.data).toMatchObject({ 'reviews.googleRating': '4.9', 'reviews.googleCount': '23' });
  });
});

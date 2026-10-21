import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import type request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { createApp, createUser, externalMedia, login, resetDb } from './helpers.js';

let app: NestExpressApplication;
let prisma: PrismaService;
let http: () => ReturnType<typeof request>;
let admin: Awaited<ReturnType<typeof login>>;

beforeAll(async () => {
  ({ app, prisma, http } = (await createApp()) as never);
});
beforeEach(async () => {
  await resetDb(prisma);
  await createUser(prisma, 'admin@dvg.test', 'admin');
  admin = await login(app, 'admin@dvg.test');
});
afterAll(() => app.close());

const form = (over: Record<string, unknown> = {}) => ({
  name: 'Nguyễn Minh Anh',
  email: 'Khach@Example.com',
  phone: '0911296979',
  message: 'Tôi cần tư vấn thuê căn hộ 2 phòng ngủ.',
  consent: true,
  elapsedMs: 8000,
  ...over,
});

describe('lead intake', () => {
  it('stores real submissions and lets staff process them', async () => {
    await http().post('/api/v1/contact').send(form({ intent: 'Tìm thuê bất động sản' })).expect(202);
    const lead = await prisma.lead.findFirstOrThrow();
    expect(lead).toMatchObject({ kind: 'CONTACT', email: 'khach@example.com', status: 'NEW' });
    expect(lead.ipHash).toMatch(/^[a-f0-9]{64}$/);
    const list = await admin.get('/api/v1/admin/leads?status=NEW').expect(200);
    expect(list.body.meta.total).toBe(1);
    await admin.patch(`/api/v1/admin/leads/${lead.id}`, { status: 'CONTACTING', notes: 'Đã gọi lần 1' }).expect(200);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('CONTACTING');
  });

  it('drops bots silently and validates consent', async () => {
    await http().post('/api/v1/contact').send(form({ website: 'http://spam.example' })).expect(202);
    await http().post('/api/v1/contact').send(form({ elapsedMs: 300 })).expect(202);
    expect(await prisma.lead.count()).toBe(0);
    await http().post('/api/v1/contact').send(form({ consent: false })).expect(400);
    await http().post('/api/v1/contact').send(form({ phone: '12345' })).expect(400);
  });

  it('deduplicates repeated submissions', async () => {
    await http().post('/api/v1/contact').send(form()).expect(202);
    await http().post('/api/v1/contact').send(form()).expect(202);
    expect(await prisma.lead.count()).toBe(1);
  });

  it('links inquiries to projects and exports safe CSV', async () => {
    const project = await prisma.project.create({ data: { slug: 'sun-ponte', name: 'Sun Ponte', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.' } });
    await http().post('/api/v1/inquiries').send(form({ name: '=HYPERLINK("x")', projectSlug: 'sun-ponte' })).expect(202);
    expect((await prisma.lead.findFirstOrThrow()).projectId).toBe(project.id);
    const csv = await admin.get('/api/v1/admin/leads/export').expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(await prisma.auditLog.count({ where: { action: 'lead.export' } })).toBe(1);
  });

  it('newsletter subscription is idempotent', async () => {
    await http().post('/api/v1/newsletter').send({ email: 'a@example.com' }).expect(202);
    await http().post('/api/v1/newsletter').send({ email: 'A@example.com' }).expect(202);
    expect(await prisma.newsletterSubscriber.count()).toBe(1);
  });
});

describe('media library', () => {
  it('re-encodes real images to WebP and rejects disguised files', async () => {
    const png = await sharp({ create: { width: 64, height: 40, channels: 3, background: '#c9a24a' } }).png().toBuffer();
    const ok = await admin.agent.post('/api/v1/admin/media/upload').set('x-csrf-token', admin.csrf).field('alt', 'Ảnh <b>thử</b>').attach('file', png, { filename: 'x.png', contentType: 'image/png' }).expect(201);
    expect(ok.body.data).toMatchObject({ mimeType: 'image/webp', width: 64, height: 40, alt: 'Ảnh thử' });
    expect(ok.body.data.key).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f-]+\.webp$/);
    const fake = Buffer.from('<svg onload=alert(1)></svg>');
    await admin.agent.post('/api/v1/admin/media/upload').set('x-csrf-token', admin.csrf).attach('file', fake, { filename: 'x.png', contentType: 'image/png' }).expect(415);
  });

  it('stores MP4 videos as uploaded and keeps them out of picture slots', async () => {
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypisom'),
      Buffer.from([0, 0, 2, 0]),
      Buffer.from('isomiso2'),
      Buffer.alloc(64),
    ]);
    const res = await admin.agent.post('/api/v1/admin/media/upload').set('x-csrf-token', admin.csrf).attach('file', mp4, { filename: 'tour.mp4', contentType: 'video/mp4' }).expect(201);
    expect(res.body.data).toMatchObject({ mimeType: 'video/mp4', width: null });
    expect(res.body.data.key).toMatch(/\.mp4$/);
    const videos = await admin.get('/api/v1/admin/media?type=video').expect(200);
    expect(videos.body.data.map((m: { id: string }) => m.id)).toEqual([res.body.data.id]);
    // A video cannot be a banner image; a unit gallery may hold it, but not as cover.
    await admin.post('/api/v1/admin/banners', { type: 'NORMAL', title: 'Video', imageId: res.body.data.id }).expect(400);
    const project = await prisma.project.create({ data: { slug: 'du-an-video', name: 'Dự án video', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.' } });
    const unit = { slug: 'can-video', name: 'Căn video', projectId: project.id, propertyType: 'studio', location: 'Đà Nẵng', areaM2: 40, bedrooms: 0, bathrooms: 1, description: 'Căn hộ có video giới thiệu.' };
    await admin.post('/api/v1/admin/properties', { ...unit, coverImageId: res.body.data.id }).expect(400);
    const ok = await admin.post('/api/v1/admin/properties', { ...unit, galleryImageIds: [res.body.data.id] }).expect(201);
    expect(ok.body.data.gallery[0].mimeType).toBe('video/mp4');
  });

  it('reports invalid fields individually', async () => {
    const res = await admin.post('/api/v1/admin/blog/posts', { slug: 'Sai Slug', title: 'x', excerpt: 'ngắn', category: 'tin-doanh-nghiep' }).expect(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['slug', 'title', 'excerpt']));
    expect(res.body.error.details[0].constraints.length).toBeGreaterThan(0);
  });

  it('refuses to delete media that content still uses', async () => {
    const media = await externalMedia(prisma);
    await admin.post('/api/v1/admin/banners', { type: 'NORMAL', title: 'Banner', imageId: media.id }).expect(201);
    const res = await admin.del(`/api/v1/admin/media/${media.id}`).expect(409);
    expect(res.body.error.details.banners).toBe(1);
  });
});

describe('blog', () => {
  it('schedules posts, strips HTML and needs content to publish', async () => {
    await admin.post('/api/v1/admin/blog/posts', { slug: 'bai-viet', title: 'Bài viết', excerpt: 'Tóm tắt bài viết đủ dài.', category: 'tin-doanh-nghiep', status: 'PUBLISHED' }).expect(400);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const created = await admin.post('/api/v1/admin/blog/posts', { slug: 'bai-viet', title: 'Bài viết', excerpt: 'Tóm tắt bài viết đủ dài.', content: 'Đoạn một <script>x()</script>an toàn.\n\nĐoạn hai.', category: 'tin-doanh-nghiep', tags: ['Thị trường', 'Đà Nẵng'], status: 'PUBLISHED', publishedAt: future }).expect(201);
    expect(created.body.data.content).toBe('Đoạn một an toàn.\n\nĐoạn hai.');
    expect(created.body.data.tags.map((t: { slug: string }) => t.slug)).toEqual(['thi-truong', 'da-nang']);
    await http().get('/api/v1/blog/bai-viet').expect(404);
    await admin.patch(`/api/v1/admin/blog/posts/${created.body.data.id}`, { publishedAt: new Date(Date.now() - 1000).toISOString() }).expect(200);
    await http().get('/api/v1/blog/bai-viet').expect(200);
    expect((await http().get('/api/v1/blog/categories').expect(200)).body.data.find((c: { slug: string }) => c.slug === 'tin-doanh-nghiep').postCount).toBe(1);
  });
});

describe('properties', () => {
  it('filters published units and keeps demo units out of the sitemap', async () => {
    const project = await prisma.project.create({ data: { slug: 'monarchy', name: 'The Monarchy', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.', status: 'PUBLISHED', publishedAt: new Date() } });
    const type = await prisma.propertyType.findUniqueOrThrow({ where: { code: '2pn' } });
    const unit = (slug: string, rent: string, extra = {}) => admin.post('/api/v1/admin/properties', { slug, name: `Căn ${slug}`, projectId: project.id, propertyType: '2pn', location: 'Sơn Trà, Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Căn hộ hướng sông Hàn.', rentPriceVnd: rent, status: 'PUBLISHED', ...extra }).expect(201);
    await unit('song-han-a', '15000000');
    await unit('song-han-b', '25000000', { isDemo: true });
    await unit('song-han-c', '9000000', { status: 'DRAFT' });
    const cheap = await http().get('/api/v1/properties?maxRentVnd=20000000&project=monarchy').expect(200);
    expect(cheap.body.data.map((p: { slug: string }) => p.slug)).toEqual(['song-han-a']);
    const search = await http().get(`/api/v1/properties?q=${encodeURIComponent('song han monarchy')}&sort=price-desc`).expect(200);
    expect(search.body.data.map((p: { slug: string }) => p.slug)).toEqual(['song-han-b', 'song-han-a']);
    expect((await http().get('/api/v1/sitemap').expect(200)).body.data.properties.map((p: { slug: string }) => p.slug)).toEqual(['song-han-a']);
    expect(type.code).toBe('2pn');
    await admin.post('/api/v1/admin/properties', { slug: 'x-1', name: 'Căn X', projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Mô tả đủ dài.', rentPriceVnd: '1.5' }).expect(400);
  });
});

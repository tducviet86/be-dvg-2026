import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { createApp, createUser, externalMedia, login, resetDb } from './helpers.js';

let app: NestExpressApplication;
let prisma: PrismaService;
let http: () => ReturnType<typeof request>;
let admin: Awaited<ReturnType<typeof login>>;
let cover: { id: string };

beforeAll(async () => {
  ({ app, prisma, http } = (await createApp()) as never);
});
beforeEach(async () => {
  await resetDb(prisma);
  await createUser(prisma, 'admin@dvg.test', 'admin');
  admin = await login(app, 'admin@dvg.test');
  cover = await externalMedia(prisma, '/images/projects/capital.jpg');
});
afterAll(() => app.close());

const base = (over: Record<string, unknown> = {}) => ({
  slug: 'capital-square',
  name: 'Capital Square',
  categories: ['development', 'sale'],
  location: 'Bên sông Hàn · Đà Nẵng',
  intro: 'Không gian đô thị bên sông Hàn, Đà Nẵng.',
  coverImageId: cover.id,
  ...over,
});
const publicBanners = async () => (await http().get('/api/v1/banners').expect(200)).body.data as { title: string; href: string | null }[];
const sitemap = async () => (await http().get('/api/v1/sitemap').expect(200)).body.data;

describe('projects & homepage banner', () => {
  it('draft projects stay private until published, then appear in listings and sitemap', async () => {
    const created = await admin.post('/api/v1/admin/projects', base()).expect(201);
    const id = created.body.data.id;
    await http().get('/api/v1/projects/capital-square').expect(404);
    expect((await http().get('/api/v1/projects').expect(200)).body.data).toHaveLength(0);
    expect((await sitemap()).projects).toHaveLength(0);

    await admin.patch(`/api/v1/admin/projects/${id}`, { status: 'PUBLISHED' }).expect(200);
    const detail = await http().get('/api/v1/projects/capital-square').expect(200);
    expect(detail.body.data).toMatchObject({ name: 'Capital Square', categories: ['development', 'sale'] });
    expect(detail.body.data).not.toHaveProperty('status');
    expect((await sitemap()).projects.map((p: { slug: string }) => p.slug)).toEqual(['capital-square']);
    expect((await http().get('/api/v1/projects?category=development').expect(200)).body.meta.total).toBe(1);
    expect((await http().get('/api/v1/projects?category=rent').expect(200)).body.meta.total).toBe(0);
  });

  it('the admin list counts statuses, sorts and says who created each project', async () => {
    await admin.post('/api/v1/admin/projects', base({ status: 'PUBLISHED' })).expect(201);
    await admin.post('/api/v1/admin/projects', base({ slug: 'an-binh', name: 'An Bình' })).expect(201);
    const list = (query = '') => admin.get(`/api/v1/admin/projects?${query}`).expect(200).then((r) => r.body);
    const body = await list('sort=name');
    expect(body.data.map((p: { slug: string }) => p.slug)).toEqual(['an-binh', 'capital-square']);
    expect(body.meta.byStatus).toEqual({ DRAFT: 1, PUBLISHED: 1 });
    expect(body.data[0].createdBy).toEqual(expect.any(String));
    expect((await list('sort=created')).data[0].slug).toBe('an-binh');
    // Counts ignore the status filter, so every card keeps its number.
    expect((await list('status=DRAFT')).meta.byStatus).toEqual({ DRAFT: 1, PUBLISHED: 1 });
    await admin.get('/api/v1/admin/projects?sort=random').expect(400);
    for (const path of ['blog/posts', 'pages', 'jobs', 'leads'])
      expect((await admin.get(`/api/v1/admin/${path}?sort=name`).expect(200)).body.meta.byStatus).toEqual(expect.any(Object));
  });

  it('enabling the banner in the project form creates exactly one linked banner', async () => {
    const created = await admin.post('/api/v1/admin/projects', base({ status: 'PUBLISHED', banner: { enabled: true, useProjectImage: true, position: 1 } })).expect(201);
    const id = created.body.data.id;
    let banners = await publicBanners();
    expect(banners).toEqual([expect.objectContaining({ title: 'Capital Square', href: '/du-an/capital-square' })]);

    // Saving the project again (several times) never duplicates the banner.
    for (let i = 0; i < 3; i++)
      await admin.patch(`/api/v1/admin/projects/${id}`, { banner: { enabled: true, title: `Capital ${i}` } }).expect(200);
    expect(await prisma.banner.count({ where: { projectId: id } })).toBe(1);
    banners = await publicBanners();
    expect(banners[0].title).toBe('Capital 2');

    // The banner API refuses a second banner for the same project.
    const dup = await admin.post('/api/v1/admin/banners', { type: 'PROJECT', projectId: id, useProjectImage: true }).expect(409);
    expect(dup.body.error.code).toBe('CONFLICT');
  });

  it('slug changes keep the banner link correct and redirect the old URL', async () => {
    const { body } = await admin.post('/api/v1/admin/projects', base({ status: 'PUBLISHED', banner: { enabled: true, useProjectImage: true } })).expect(201);
    await admin.patch(`/api/v1/admin/projects/${body.data.id}`, { slug: 'capital-square-da-nang' }).expect(200);
    expect((await publicBanners())[0].href).toBe('/du-an/capital-square-da-nang');
    const moved = await http().get('/api/v1/projects/capital-square').redirects(0).expect(301);
    expect(moved.headers.location).toBe('/api/v1/projects/capital-square-da-nang');
    expect(moved.body.error.details.slug).toBe('capital-square-da-nang');
    // Reusing the old slug for a new project replaces the redirect.
    await admin.post('/api/v1/admin/projects', base({ slug: 'capital-square', name: 'Dự án khác', status: 'PUBLISHED' })).expect(201);
    await http().get('/api/v1/projects/capital-square').expect(200);
  });

  it('unpublishing or disabling hides the banner without deleting the project', async () => {
    const { body } = await admin.post('/api/v1/admin/projects', base({ status: 'PUBLISHED', banner: { enabled: true, useProjectImage: true } })).expect(201);
    const id = body.data.id;
    await admin.patch(`/api/v1/admin/projects/${id}`, { status: 'DRAFT' }).expect(200);
    expect(await publicBanners()).toHaveLength(0);
    expect((await sitemap()).projects).toHaveLength(0);
    await admin.patch(`/api/v1/admin/projects/${id}`, { status: 'PUBLISHED', banner: { enabled: false } }).expect(200);
    expect(await publicBanners()).toHaveLength(0);
    const banner = await prisma.banner.findUniqueOrThrow({ where: { projectId: id } });
    expect(banner.isActive).toBe(false);
    await http().get('/api/v1/projects/capital-square').expect(200);
  });

  it('both admin modules edit the same banner record, with stale-write protection', async () => {
    const { body } = await admin.post('/api/v1/admin/projects', base({ status: 'PUBLISHED', banner: { enabled: true, useProjectImage: true } })).expect(201);
    const project = (await admin.get(`/api/v1/admin/projects/${body.data.id}`).expect(200)).body.data;
    const bannerId = project.banner.id;
    // Banner module turns it off …
    await admin.patch(`/api/v1/admin/banners/${bannerId}`, { isActive: false, expectedUpdatedAt: project.banner.updatedAt }).expect(200);
    // … so the project form (still holding the old banner version) must reload.
    const stale = await admin.patch(`/api/v1/admin/projects/${project.id}`, { banner: { enabled: true, expectedBannerUpdatedAt: project.banner.updatedAt } }).expect(409);
    expect(stale.body.error.message).toMatch(/Banner/);
    const reloaded = (await admin.get(`/api/v1/admin/projects/${project.id}`).expect(200)).body.data;
    expect(reloaded.banner.isActive).toBe(false);
    await admin.patch(`/api/v1/admin/projects/${project.id}`, { expectedUpdatedAt: '2000-01-01T00:00:00.000Z', name: 'Tên mới' }).expect(409);
  });

  it('keeps one consistent order across normal and project banners', async () => {
    const img = await externalMedia(prisma, '/images/img1.png');
    for (const title of ['A', 'B']) await admin.post('/api/v1/admin/banners', { type: 'NORMAL', title, imageId: img.id }).expect(201);
    await admin.post('/api/v1/admin/projects', base({ status: 'PUBLISHED', banner: { enabled: true, useProjectImage: true, position: 1 } })).expect(201);
    expect((await publicBanners()).map((b) => b.title)).toEqual(['Capital Square', 'A', 'B']);
    const b = (await admin.get('/api/v1/admin/banners').expect(200)).body.data.find((x: { title: string }) => x.title === 'B');
    await admin.patch(`/api/v1/admin/banners/${b.id}`, { position: 1 }).expect(200);
    const orders = (await admin.get('/api/v1/admin/banners').expect(200)).body.data.map((x: { sortOrder: number }) => x.sortOrder);
    expect(orders).toEqual([1, 2, 3]);
    expect((await publicBanners()).map((x) => x.title)).toEqual(['B', 'Capital Square', 'A']);
    // A NORMAL banner can never link a project (database CHECK + API).
    await admin.post('/api/v1/admin/banners', { type: 'NORMAL', title: 'C', imageId: img.id, projectId: b.id }).expect(400);
  });

  it('refuses to archive a project with units; archived slugs answer 410', async () => {
    const { body } = await admin.post('/api/v1/admin/projects', base({ status: 'PUBLISHED', banner: { enabled: true, useProjectImage: true } })).expect(201);
    const type = await prisma.propertyType.findFirstOrThrow();
    const unit = await admin.post('/api/v1/admin/properties', { slug: 'can-a-01', name: 'Căn A 01', projectId: body.data.id, propertyType: type.code, location: 'Đà Nẵng', areaM2: 55.5, bedrooms: 1, bathrooms: 1, description: 'Mô tả căn hộ đủ dài.', rentPriceVnd: '12500000' }).expect(201);
    expect(unit.body.data.rentPriceVnd).toBe('12500000');
    await admin.del(`/api/v1/admin/projects/${body.data.id}`).expect(409);
    await admin.del(`/api/v1/admin/properties/${unit.body.data.id}`).expect(204);
    await admin.del(`/api/v1/admin/projects/${body.data.id}`).expect(204);
    await http().get('/api/v1/projects/capital-square').expect(410);
    expect(await prisma.banner.count()).toBe(0);
  });

  it('strips HTML from content fields', async () => {
    const { body } = await admin.post('/api/v1/admin/projects', base({ name: 'Capital <img src=x onerror=alert(1)>Square', intro: '<script>alert(1)</script>Giới thiệu an toàn cho dự án.' })).expect(201);
    expect(body.data.name).toBe('Capital Square');
    expect(body.data.intro).toBe('Giới thiệu an toàn cho dự án.');
  });

  it('validates input and reports field errors', async () => {
    const res = await admin.post('/api/v1/admin/projects', { slug: 'Không Hợp Lệ', name: 'x', categories: [] }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.length).toBeGreaterThan(2);
    await admin.post('/api/v1/admin/projects', base({ unknownField: 1 })).expect(400);
  });
});

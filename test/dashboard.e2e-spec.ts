import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { vnDay } from '../src/common/vn-day.js';
import { createApp, createUser, externalMedia, login, resetDb } from './helpers.js';

let app: NestExpressApplication;
let prisma: PrismaService;
let http: () => ReturnType<typeof request>;

beforeAll(async () => {
  ({ app, prisma, http } = (await createApp()) as never);
});
beforeEach(() => resetDb(prisma));
afterAll(() => app.close());

// Views are counted by Vietnamese day.
const day = (offset: number) => new Date(vnDay().getTime() - offset * 86_400_000);

describe('admin dashboard', () => {
  it('sums traffic, leads, inventory and unfinished content for the chosen period', async () => {
    await createUser(prisma, 'admin@dvg.test', 'admin');
    await createUser(prisma, 'editor@dvg.test', 'editor');
    const admin = await login(app, 'admin@dvg.test');
    const project = await prisma.project.create({ data: { slug: 'monarchy', name: 'The Monarchy', location: 'Đà Nẵng', intro: 'Dự án.', status: 'PUBLISHED', publishedAt: new Date() } });
    const type = await prisma.propertyType.findUniqueOrThrow({ where: { code: '2pn' } });
    const cover = await externalMedia(prisma);
    const unit = (slug: string, extra = {}) =>
      prisma.property.create({
        data: { slug, name: `Căn ${slug}`, projectId: project.id, propertyTypeId: type.id, location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Ngắn.', searchText: slug, status: 'PUBLISHED', publishedAt: new Date(), rentPriceVnd: 20_000_000n, ...extra },
      });
    const hot = await unit('can-hot', { coverImageId: cover.id });
    await unit('can-nguoi-xem');
    await unit('can-da-thue', { availability: 'RENTED' });
    await unit('can-mau', { isDemo: true });
    // 12 views today and 3 yesterday on one unit; 5 views 40 days ago (previous 30-day period).
    await prisma.propertyViewDay.createMany({
      data: [
        { propertyId: hot.id, day: day(0), views: 12 },
        { propertyId: hot.id, day: day(1), views: 3 },
        { propertyId: hot.id, day: day(40), views: 5 },
      ],
    });
    await http().post('/api/v1/inquiries').send({ name: 'Khách A', email: 'a@example.com', phone: '0911296979', message: 'Tôi muốn thuê căn này.', consent: true, elapsedMs: 8000, propertySlug: 'can-hot', source: 'Tư vấn căn hộ' }).expect(202);

    const res = await admin.get('/api/v1/admin/dashboard?days=30').expect(200);
    const d = res.body.data;
    expect(d.traffic.series).toHaveLength(30);
    expect(d.traffic.series.at(-1)).toMatchObject({ views: 12, leads: 1 });
    expect(d.traffic).toMatchObject({ views: 15, prevViews: 5, leads: 1, prevLeads: 0 });
    expect(d.traffic.conversion).toBeCloseTo(1 / 15);
    // Demo units are left out of inventory and health.
    expect(d.inventory).toMatchObject({ total: 3, availability: { AVAILABLE: 2, RENTED: 1 } });
    expect(d.inventory.occupancy).toBeCloseTo(1 / 3);
    expect(d.inventory.projects[0]).toMatchObject({ name: 'The Monarchy', total: 3, views: 15, avgRent: 20_000_000 });
    expect(d.topUnits[0]).toMatchObject({ id: hot.id, views: 15, leads: 1, cover: cover.url });
    // Views by source in the period; those from before sources were kept are "unknown".
    expect(d.traffic.bySource).toEqual([{ source: 'unknown', views: 15 }]);
    await prisma.propertyViewSource.createMany({
      data: [
        { propertyId: hot.id, day: day(0), source: 'ai', views: 7 },
        { propertyId: hot.id, day: day(0), source: 'zalo', views: 3 },
        { propertyId: hot.id, day: day(40), source: 'google', views: 5 },
      ],
    });
    const withSources = (await admin.get('/api/v1/admin/dashboard?days=30').expect(200)).body.data;
    expect(withSources.traffic.bySource).toEqual([
      { source: 'ai', views: 7 },
      { source: 'unknown', views: 5 },
      { source: 'zalo', views: 3 },
    ]);
    expect(withSources.topUnits[0].sources).toEqual([
      { source: 'ai', views: 7 },
      { source: 'zalo', views: 3 },
    ]);
    expect(d.coldUnits.map((u: { name: string }) => u.name)).toEqual(['Căn can-nguoi-xem']);
    expect(d.health).toMatchObject({ units: 3, noCover: 2, noSeo: 3, shortText: 3 });
    // Model apartments are samples: nothing to fill in or sell through, so
    // health, inventory and the unviewed list ignore them.
    const noPrice = d.health.noPrice;
    const model = await unit('can-mau-c1', { floorNote: 'Tầng 5-10', forRent: false, forSale: true });
    const after = (await admin.get('/api/v1/admin/dashboard?days=30').expect(200)).body.data;
    expect(after.health).toMatchObject({ units: 3, noCover: 2, noSeo: 3, shortText: 3, noPrice });
    expect(after.inventory.total).toBe(3);
    expect(after.coldUnits.map((u: { name: string }) => u.name)).toEqual(['Căn can-nguoi-xem']);
    await prisma.property.delete({ where: { id: model.id } });
    expect(d.leads.byStatus).toEqual({ NEW: 1 });
    expect(d.leads.bySource).toEqual([{ source: expect.any(String), count: 1 }]);
    // Activity names the record that changed.
    await admin.patch(`/api/v1/admin/properties/${hot.id}`, { availability: 'RESERVED', expectedUpdatedAt: (await prisma.property.findUniqueOrThrow({ where: { id: hot.id } })).updatedAt.toISOString() }).expect(200);
    const again = (await admin.get('/api/v1/admin/dashboard').expect(200)).body.data;
    expect(again.activity[0]).toMatchObject({ action: 'property.update', label: 'Căn can-hot', actor: { name: 'admin' } });
    // A week: shorter series; the 40-day-old views are outside both periods.
    const week = (await admin.get('/api/v1/admin/dashboard?days=7').expect(200)).body.data;
    expect(week.traffic.series).toHaveLength(7);
    expect(week.traffic.prevViews).toBe(0);
    await admin.get('/api/v1/admin/dashboard?days=12').expect(400);
    // Editors see content numbers but no lead data or activity log.
    const editor = await login(app, 'editor@dvg.test');
    const limited = (await editor.get('/api/v1/admin/dashboard').expect(200)).body.data;
    expect(limited.traffic.leads).toBeNull();
    expect(limited.leads).toBeNull();
    expect(limited.topUnits[0].leads).toBe(0);
    await http().get('/api/v1/admin/dashboard').expect(401);
  });

  it('counts by the Vietnamese day: 01:30 there is still the day before in UTC', () => {
    expect(vnDay(new Date('2026-11-12T18:30:00Z')).toISOString().slice(0, 10)).toBe('2026-11-13');
    expect(vnDay(new Date('2026-11-12T16:59:00Z')).toISOString().slice(0, 10)).toBe('2026-11-12');
  });

  it('lists every viewed unit, deleted, hidden and model ones too, adding up to the total', async () => {
    await createUser(prisma, 'admin@dvg.test', 'admin');
    const admin = await login(app, 'admin@dvg.test');
    const project = await prisma.project.create({ data: { slug: 'capital', name: 'Capital Square', location: 'Đà Nẵng', intro: 'Dự án.', status: 'PUBLISHED', publishedAt: new Date() } });
    const type = await prisma.propertyType.findUniqueOrThrow({ where: { code: '2pn' } });
    const unit = (slug: string, extra = {}) =>
      prisma.property.create({
        data: { slug, name: `Căn ${slug}`, unitCode: slug.toUpperCase(), projectId: project.id, propertyTypeId: type.id, location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Ngắn.', searchText: slug, status: 'PUBLISHED', publishedAt: new Date(), ...extra },
      });
    const live = await unit('c4-01');
    const model = await unit('c4-05', { floorNote: 'Tầng 5-10' });
    const hidden = await unit('c4-07', { status: 'ARCHIVED' });
    const gone = await unit('c4-09', { deletedAt: new Date() });
    await prisma.propertyViewDay.createMany({
      data: [
        { propertyId: live.id, day: day(0), views: 6 },
        { propertyId: model.id, day: day(1), views: 9 },
        { propertyId: hidden.id, day: day(2), views: 3 },
        { propertyId: gone.id, day: day(3), views: 2 },
      ],
    });
    const d = (await admin.get('/api/v1/admin/dashboard?days=7').expect(200)).body.data;
    expect(d.traffic.views).toBe(20);
    expect(d.traffic.byKind).toEqual({ live: 6, model: 9, hidden: 3, deleted: 2 });
    expect(d.unitViews.map((u: { unitCode: string; kind: string; views: number; project: string }) => [u.unitCode, u.kind, u.views, u.project])).toEqual([
      ['C4-05', 'model', 9, 'Capital Square'],
      ['C4-01', 'live', 6, 'Capital Square'],
      ['C4-07', 'hidden', 3, 'Capital Square'],
      ['C4-09', 'deleted', 2, 'Capital Square'],
    ]);
    expect(d.unitViews.reduce((s: number, u: { views: number }) => s + u.views, 0)).toBe(d.traffic.views);
    // The unit list counts the same period as the dashboard when asked.
    const list = (await admin.get('/api/v1/admin/properties?interestDays=7&q=C4-01').expect(200)).body.data;
    expect(list[0].interest).toEqual({ days: 7, views: 6, leads: 0 });
    const twoDays = (await admin.get('/api/v1/admin/properties?interestDays=30&kind=model').expect(200)).body.data;
    expect(twoDays[0].interest).toMatchObject({ days: 30, views: 9 });
    await admin.get('/api/v1/admin/properties?interestDays=12').expect(400);
  });
});

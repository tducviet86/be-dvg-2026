import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { vnDay, vnDayStart } from '../src/common/vn-day.js';
import { createServer, type Server } from 'node:http';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
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

  it('counts a request sent early in the morning (Vietnamese time) on that day', async () => {
    await createUser(prisma, 'admin@dvg.test', 'admin');
    const admin = await login(app, 'admin@dvg.test');
    // 01:00 today in Đà Nẵng is still yesterday in UTC, as the column stores it.
    const early = new Date(vnDayStart(day(0)).getTime() + 3_600_000);
    await prisma.lead.create({ data: { kind: 'CONTACT', source: 'Liên hệ', name: 'Khách sớm', email: 'som@example.com', message: 'Xin chào.', consentAt: early, createdAt: early } });
    const d = (await admin.get('/api/v1/admin/dashboard?days=7').expect(200)).body.data;
    expect(d.traffic.series.at(-1).leads).toBe(1);
    expect(d.traffic.series.at(-2).leads).toBe(0);
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

  it('exports a chosen period as an Excel report with photos, by permission', async () => {
    // A unit photo served the way R2 serves it.
    const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#1d5446' } }).png().toBuffer();
    const photos: Server = createServer((req, res) => (req.url === '/can-hot.png' ? res.writeHead(200, { 'content-type': 'image/png' }).end(png) : res.writeHead(404).end()));
    await new Promise<void>((done) => photos.listen(0, '127.0.0.1', done));
    const port = (photos.address() as { port: number }).port;
    try {
      await createUser(prisma, 'admin@dvg.test', 'admin');
      await createUser(prisma, 'editor@dvg.test', 'editor');
      await createUser(prisma, 'sales@dvg.test', 'sales');
      const admin = await login(app, 'admin@dvg.test');
      const project = await prisma.project.create({ data: { slug: 'monarchy', name: 'The Monarchy', location: 'Đà Nẵng', intro: 'Dự án.', status: 'PUBLISHED', publishedAt: new Date() } });
      const type = await prisma.propertyType.findUniqueOrThrow({ where: { code: '2pn' } });
      const cover = await externalMedia(prisma, `http://127.0.0.1:${port}/can-hot.png`);
      const unit = (slug: string, extra = {}) =>
        prisma.property.create({
          data: { slug, name: `Căn ${slug}`, unitCode: slug.toUpperCase(), projectId: project.id, propertyTypeId: type.id, location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Ngắn.', searchText: slug, status: 'PUBLISHED', publishedAt: new Date(), ...extra },
        });
      const hot = await unit('m-2201', { coverImageId: cover.id });
      const other = await unit('m-1705');
      await prisma.propertyViewDay.createMany({
        data: [
          { propertyId: hot.id, day: day(0), views: 12 },
          { propertyId: hot.id, day: day(2), views: 3 },
          { propertyId: other.id, day: day(1), views: 4 },
          // Outside the period: counted as the previous one.
          { propertyId: hot.id, day: day(10), views: 50 },
        ],
      });
      await prisma.propertyViewSource.createMany({
        data: [
          { propertyId: hot.id, day: day(0), source: 'google', views: 8 },
          { propertyId: hot.id, day: day(0), source: 'zalo', views: 4 },
        ],
      });
      // Taps on the call and Zalo links: one on the unit's page, one elsewhere; robots are not counted.
      const browser = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
      await http().post('/api/v1/contact-clicks').set('user-agent', browser).send({ kind: 'call', source: 'google', path: '/cho-thue/m-2201', unit: 'm-2201', target: 'tel:+84911296979' }).expect(204);
      await http().post('/api/v1/contact-clicks').set('user-agent', browser).send({ kind: 'zalo', source: 'zalo', path: '/lien-he', target: 'https://zalo.me/0911296979' }).expect(204);
      await http().post('/api/v1/contact-clicks').set('user-agent', 'Googlebot/2.1').send({ kind: 'call', path: '/' }).expect(204);
      await http().post('/api/v1/contact-clicks').set('user-agent', browser).send({ kind: 'sms', path: '/' }).expect(400);
      await http().post('/api/v1/inquiries').send({ name: 'Kim Min-ji', email: 'minji@example.com', phone: '0911296979', message: 'Tôi muốn thuê căn này.', consent: true, elapsedMs: 8000, propertySlug: 'm-2201', source: 'Tư vấn căn hộ' }).expect(202);

      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const binary = (res: { on: (e: string, cb: (c?: Buffer) => void) => void; setEncoding?: unknown }, cb: (err: null, body: Buffer) => void) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c!));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      };
      const download = async (agent: Awaited<ReturnType<typeof login>>, from: Date, to: Date) => {
        const res = await agent.get(`/api/v1/admin/dashboard/export?from=${iso(from)}&to=${iso(to)}`).buffer(true).parse(binary as never).expect(200);
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(res.body as never);
        return { res, wb };
      };

      const { res, wb } = await download(admin, day(6), day(0));
      expect(res.headers['content-type']).toContain('spreadsheetml');
      // "1⁄11-7⁄11-Báo Cáo WEB Đất Vàng Group.xlsx", with an ASCII name for old clients.
      const dm = (d: Date) => `${d.getUTCDate()}⁄${d.getUTCMonth() + 1}`;
      const name = (disposition: string) => decodeURIComponent(/filename\*=UTF-8''(.+)$/.exec(disposition)![1]);
      expect(res.headers['content-disposition']).toContain(`filename="bao-cao-dat-vang-${iso(day(6))}_${iso(day(0))}.xlsx"`);
      expect(name(res.headers['content-disposition'])).toBe(`${dm(day(6))}-${dm(day(0))}-Báo Cáo WEB Đất Vàng Group.xlsx`);
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Tổng quan', 'Theo ngày', 'Theo căn hộ', 'Theo dự án', 'Nguồn truy cập', 'Lượt bấm gọi', 'Khách liên hệ']);
      // The dashboard shows the taps too: totals, by kind, the latest with their unit.
      const dash = (await admin.get('/api/v1/admin/dashboard?days=7').expect(200)).body.data;
      expect(dash.contactClicks).toMatchObject({ total: 2, prevTotal: 0, byKind: { call: 1, zalo: 1 } });
      expect(dash.contactClicks.recent[1]).toMatchObject({ kind: 'call', target: '+84911296979', path: '/cho-thue/m-2201', property: { unitCode: 'M-2201' } });
      expect(dash.traffic.series.at(-1).clicks).toBe(2);
      const clicks = wb.getWorksheet('Lượt bấm gọi')!;
      expect(clicks.getRow(6).values).toEqual([undefined, expect.any(Date), 'Bấm gọi', '+84911296979', 'Căn m-2201 (M-2201)', 'The Monarchy', '/cho-thue/m-2201', 'Google']);
      expect(clicks.getCell('B5').value).toBe('Bấm Zalo');
      // Overview: logo, daily chart, source ring and the top unit's photo.
      const overview = wb.getWorksheet('Tổng quan')!;
      expect(overview.getImages()).toHaveLength(4);
      expect(overview.getCell('C2').value).toBe('BÁO CÁO HOẠT ĐỘNG WEBSITE');
      expect(String(overview.getCell('C4').value)).toContain(`${iso(day(6)).slice(8)}/${iso(day(6)).slice(5, 7)}`);
      // Daily sheet: 7 days, then the total.
      const daily = wb.getWorksheet('Theo ngày')!;
      expect(daily.getRow(4).values).toEqual([undefined, 'Ngày', 'Thứ', 'Lượt xem', 'Google', 'Zalo', 'Chưa rõ (trước khi đo nguồn)', 'Bấm gọi', 'Bấm Zalo', 'Bấm WhatsApp', 'Khách liên hệ (form)']);
      expect(daily.getRow(11).values).toEqual([undefined, day(0), expect.any(String), 12, 8, 4, 0, 1, 1, 0, 1]);
      expect(daily.getRow(12).values).toEqual([undefined, 'Tổng cộng', '', 19, 8, 4, 7, 1, 1, 0, 1]);
      expect(daily.getCell('A5').numFmt).toBe('dd/mm/yyyy');
      expect(daily.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
      // Unit sheet: the photo of the unit that has one, most viewed first.
      const units = wb.getWorksheet('Theo căn hộ')!;
      expect([units.getCell('C5').value, units.getCell('D5').value, units.getCell('E5').value, units.getCell('H5').value, units.getCell('J5').value, units.getCell('K5').value]).toEqual(['M-2201', 'Căn m-2201', 'The Monarchy', 15, 1, 1]);
      expect(units.getCell('C6').value).toBe('M-1705');
      expect(units.getImages()).toHaveLength(1);
      expect(units.getImages()[0].range.tl.nativeRow).toBe(4);
      expect(wb.getWorksheet('Nguồn truy cập')!.getCell('B5').value).toBe('Google');
      const contacts = wb.getWorksheet('Khách liên hệ')!;
      expect([contacts.getCell('B5').value, contacts.getCell('C5').value, contacts.getCell('G5').value]).toEqual(['Kim Min-ji', '0911296979', 'Căn m-2201 (M-2201)']);
      expect(await prisma.auditLog.count({ where: { action: 'lead.export' } })).toBe(1);

      // A whole month: named by the month; days after today are not counted.
      const first = new Date(Date.UTC(day(0).getUTCFullYear(), day(0).getUTCMonth(), 1));
      const end = new Date(Date.UTC(day(0).getUTCFullYear(), day(0).getUTCMonth() + 1, 0));
      const month = await download(admin, first, end);
      expect(name(month.res.headers['content-disposition'])).toBe(`T${first.getUTCMonth() + 1}⁄${first.getUTCFullYear()}-Báo Cáo WEB Đất Vàng Group.xlsx`);
      expect(month.wb.getWorksheet('Theo ngày')!.rowCount).toBe(4 + day(0).getUTCDate() + 1);

      // Editors: traffic only. Sales: contact counts, no personal data.
      const editor = await download(await login(app, 'editor@dvg.test'), day(6), day(0));
      expect(editor.wb.worksheets.map((w) => w.name)).not.toContain('Khách liên hệ');
      expect(editor.wb.getWorksheet('Theo ngày')!.getRow(4).values).not.toContain('Khách liên hệ (form)');
      expect(editor.wb.worksheets.map((w) => w.name)).toContain('Lượt bấm gọi');
      const sales = await download(await login(app, 'sales@dvg.test'), day(6), day(0));
      expect(sales.wb.worksheets.map((w) => w.name)).not.toContain('Khách liên hệ');
      expect(sales.wb.getWorksheet('Theo ngày')!.getRow(12).values).toEqual([undefined, 'Tổng cộng', '', 19, 8, 4, 7, 1, 1, 0, 1]);

      // Periods that cannot be reported.
      await admin.get(`/api/v1/admin/dashboard/export?from=${iso(day(0))}&to=${iso(day(3))}`).expect(400);
      await admin.get(`/api/v1/admin/dashboard/export?from=${iso(day(400))}&to=${iso(day(0))}`).expect(400);
      await admin.get(`/api/v1/admin/dashboard/export?from=${iso(day(-2))}&to=${iso(day(-5))}`).expect(400);
      await admin.get('/api/v1/admin/dashboard/export?from=2026-02-30&to=2026-03-02').expect(400);
      await admin.get('/api/v1/admin/dashboard/export?from=hom-qua&to=2026-03-02').expect(400);
      await http().get(`/api/v1/admin/dashboard/export?from=${iso(day(6))}&to=${iso(day(0))}`).expect(401);
    } finally {
      photos.close();
    }
  });
});

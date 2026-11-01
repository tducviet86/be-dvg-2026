import { createServer, type Server } from 'node:http';
import { vi } from 'vitest';

// Before the app's modules load (they read the environment once).
vi.hoisted(() => {
  process.env.INDEXNOW_ENDPOINT = 'http://127.0.0.1:4198/indexnow';
});
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../src/database/prisma.service.js';
import { IndexNowService } from '../src/modules/indexnow/indexnow.service.js';
import { createApp, createUser, login, resetDb } from './helpers.js';

// A local stand-in for api.indexnow.org records what would be sent.
const received: { host: string; key: string; keyLocation: string; urlList: string[] }[] = [];
const stub: Server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    received.push(JSON.parse(body));
    res.writeHead(202).end();
  });
});

let app: NestExpressApplication;
let prisma: PrismaService;
beforeAll(async () => {
  await new Promise<void>((done) => stub.listen(4198, '127.0.0.1', done));
  ({ app, prisma } = (await createApp()) as never);
});
afterAll(async () => {
  await app.close();
  await new Promise((done) => stub.close(done));
});

describe('IndexNow', () => {
  it('tells search engines which pages changed, in every language, in one request', async () => {
    await resetDb(prisma);
    await createUser(prisma, 'admin@dvg.test', 'admin');
    const admin = await login(app, 'admin@dvg.test');
    const indexNow = app.get(IndexNowService);
    expect(indexNow.enabled).toBe(true);
    const project = await prisma.project.create({ data: { slug: 'monarchy', name: 'The Monarchy', location: 'Đà Nẵng', intro: 'Dự án.', status: 'PUBLISHED', publishedAt: new Date() } });
    const unit = (slug: string, extra = {}) =>
      admin.post('/api/v1/admin/properties', { slug, unitCode: slug.split('-').pop(), name: `Căn ${slug}`, projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Căn hộ hướng sông Hàn.', rentPriceVnd: '15000000', ...extra }).expect(201);
    await unit('can-a-a1', { status: 'PUBLISHED', forSale: true, salePriceVnd: '3000000000' });
    await unit('can-nhap-b2'); // draft: not announced
    await unit('can-mau-c3', { status: 'PUBLISHED', isDemo: true }); // sample: not announced
    await indexNow.flush();

    expect(received).toHaveLength(1);
    const [sent] = received;
    expect(sent).toMatchObject({ host: 'localhost:3000', key: 'f2f3bf2db002372ff737c2fcfe17c9ba', keyLocation: 'http://localhost:3000/f2f3bf2db002372ff737c2fcfe17c9ba.txt' });
    expect(sent.urlList).toEqual(
      expect.arrayContaining([
        'http://localhost:3000/cho-thue/can-a-a1',
        'http://localhost:3000/mua-ban/can-a-a1',
        'http://localhost:3000/en/cho-thue/can-a-a1',
        'http://localhost:3000/ko/cho-thue/can-a-a1',
        'http://localhost:3000/zh/cho-thue/can-a-a1',
        'http://localhost:3000/cho-thue/du-an/monarchy',
        'http://localhost:3000/cho-thue',
      ]),
    );
    expect(sent.urlList.join(' ')).not.toMatch(/can-nhap|can-mau/);

    // Taking a unit down is announced too (search engines drop the page).
    const live = await prisma.property.findUniqueOrThrow({ where: { slug: 'can-a-a1' } });
    await admin.del(`/api/v1/admin/properties/${live.id}`).expect(204);
    await indexNow.flush();
    expect(received[1].urlList).toContain('http://localhost:3000/cho-thue/can-a-a1');
    // Nothing queued: nothing sent.
    await indexNow.flush();
    expect(received).toHaveLength(2);
  });
});

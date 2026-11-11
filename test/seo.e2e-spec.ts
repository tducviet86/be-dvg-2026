import { createServer, type Server } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../src/database/prisma.service.js';
import { createApp, createUser, login, resetDb } from './helpers.js';

/**
 * Stand-ins for Google: the OAuth token endpoint, Search Console and Gemini.
 * The account is set before the app's modules (and their settings) load.
 */
await vi.hoisted(async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.GSC_SITE = 'sc-domain:dvg.test';
  process.env.GSC_CLIENT_EMAIL = 'seo@dvg-test.iam.gserviceaccount.com';
  process.env.GSC_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\n/g, '\\n');
  process.env.GSC_API_BASE = 'http://127.0.0.1:4196';
  process.env.GSC_TOKEN_URL = 'http://127.0.0.1:4196/token';
});

let google: Server;
let gemini: Server;
let denied = false;
const seen: { url?: string; auth?: string; body?: any }[] = [];
let app: NestExpressApplication;
let prisma: PrismaService;
let http: () => import('supertest').Agent;

const read = (req: import('node:http').IncomingMessage) =>
  new Promise<string>((done) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => done(raw));
  });

beforeAll(async () => {
  google = createServer(async (req, res) => {
    const raw = await read(req);
    seen.push({ url: req.url, auth: req.headers.authorization, body: raw });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/token') {
      const assertion = new URLSearchParams(raw).get('assertion') ?? '';
      const claims = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString());
      res.end(JSON.stringify(claims.scope.includes('webmasters.readonly') ? { access_token: 'tok-1', expires_in: 3600 } : {}));
      return;
    }
    if (denied) {
      res.writeHead(403).end('{}');
      return;
    }
    res.end(
      JSON.stringify({
        rows: [
          { keys: ['monarchy đà nẵng', 'https://dvg.test/du-an/monarchy'], clicks: 1, impressions: 120, ctr: 0.008, position: 12.34 },
          { keys: ['thuê căn hộ 2pn đà nẵng', 'https://dvg.test/en/cho-thue/nhu-cau/can-ho-2pn'], clicks: 0, impressions: 40, ctr: 0, position: 18.7 },
        ],
      }),
    );
  });
  gemini = createServer(async (req, res) => {
    const body = JSON.parse(await read(req));
    seen.push({ url: 'gemini', body });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  seoTitle: 'The Monarchy Đà Nẵng – thuê và mua căn hộ',
                  seoDescription: 'Căn hộ The Monarchy Đà Nẵng bên sông Hàn: xem căn đang cho thuê, giá theo tháng, ảnh thật và mặt bằng.',
                  keywords: ['monarchy đà nẵng'],
                  imageAlt: 'The Monarchy',
                }),
              },
            ],
          },
        ],
      }),
    );
  });
  await new Promise<void>((done) => google.listen(4196, '127.0.0.1', done));
  await new Promise<void>((done) => gemini.listen(4199, '127.0.0.1', done));
  ({ app, prisma, http } = (await createApp()) as never);
  await resetDb(prisma);
  await createUser(prisma, 'admin@dvg.test', 'admin');
  await createUser(prisma, 'editor@dvg.test', 'editor');
});
afterAll(async () => {
  await app.close();
  for (const s of [google, gemini]) {
    s.closeAllConnections();
    await new Promise((done) => s.close(done));
  }
});

const landing = {
  slug: 'can-ho-2pn',
  purpose: 'rent',
  h1: 'Cho thuê căn hộ 2 phòng ngủ Đà Nẵng',
  seoTitle: '',
  seoDescription: 'Căn hộ 2 phòng ngủ cho thuê tại Đà Nẵng.',
  intro: 'Các căn 2 phòng ngủ đang cho thuê.',
  filters: { bedrooms: '2', loai: 'apartment' },
  published: true,
};

describe('search landing pages', () => {
  it('keeps only well-formed pages, for administrators', async () => {
    const admin = await login(app, 'admin@dvg.test');
    const save = (list: unknown) => admin.put('/api/v1/admin/settings', { values: { 'seo.landings': JSON.stringify(list) } });
    await save([{ ...landing, slug: 'Có Dấu' }]).expect(400);
    await save([{ ...landing, filters: { sort: 'price' } }]).expect(400);
    await save([landing, landing]).expect(400);
    await save([{ ...landing, extra: 'x', filters: { ...landing.filters, area: '' } }]).expect(200);
    const stored = JSON.parse((await prisma.siteSetting.findUniqueOrThrow({ where: { key: 'seo.landings' } })).value as string);
    expect(stored).toEqual([landing]);
    const pub = (await http().get('/api/v1/settings/public').expect(200)).body.data;
    expect(JSON.parse(pub['seo.landings'])[0].slug).toBe('can-ho-2pn');
    const editor = await login(app, 'editor@dvg.test');
    await editor.put('/api/v1/admin/settings', { values: { 'seo.landings': '[]' } }).expect(403);
  });
});

describe('keywords from Search Console', () => {
  it('reads searches with the service account and keeps them a while', async () => {
    const admin = await login(app, 'admin@dvg.test');
    const res = (await admin.get('/api/v1/admin/seo/keywords?days=28').expect(200)).body.data;
    expect(res).toMatchObject({ configured: true, site: 'sc-domain:dvg.test', days: 28 });
    expect(res.rows[0]).toEqual({ query: 'monarchy đà nẵng', page: 'https://dvg.test/du-an/monarchy', clicks: 1, impressions: 120, ctr: 0.008, position: 12.3 });
    const query = seen.find((s) => s.url?.includes('searchAnalytics'));
    expect(query?.url).toContain(encodeURIComponent('sc-domain:dvg.test'));
    expect(query?.auth).toBe('Bearer tok-1');
    expect(JSON.parse(query!.body)).toMatchObject({ dimensions: ['query', 'page'], rowLimit: 1000 });
    // Cached: no second call to Google.
    const calls = seen.length;
    await admin.get('/api/v1/admin/seo/keywords?days=28').expect(200);
    expect(seen.length).toBe(calls);
    await admin.get('/api/v1/admin/seo/keywords?days=12').expect(400);
    const editor = await login(app, 'editor@dvg.test');
    await editor.get('/api/v1/admin/seo/keywords').expect(403);
  });

  it('says plainly when the account was not added to the property', async () => {
    denied = true;
    const admin = await login(app, 'admin@dvg.test');
    const res = await admin.get('/api/v1/admin/seo/keywords?days=7').expect(502);
    expect(res.body.message ?? res.body.error?.message).toMatch(/chưa được thêm/);
    denied = false;
  });

  it('proposes a title for the page a search lands on, and applies it', async () => {
    const admin = await login(app, 'admin@dvg.test');
    const project = await prisma.project.create({ data: { slug: 'monarchy', name: 'The Monarchy', location: 'Đà Nẵng', intro: 'Dự án bên sông Hàn.', status: 'PUBLISHED', publishedAt: new Date() } });
    const res = (await admin.post('/api/v1/admin/seo/keywords/suggest', { query: 'monarchy đà nẵng', page: 'https://dvg.test/du-an/monarchy' }).expect(200)).body.data;
    expect(res.target).toMatchObject({ kind: 'project', id: project.id, title: 'The Monarchy' });
    expect(res.suggestion.seoTitle).toContain('Monarchy');
    const prompt = JSON.stringify(seen.filter((s) => s.url === 'gemini').at(-1)?.body);
    expect(prompt).toContain('monarchy đà nẵng');
    await admin.post('/api/v1/admin/seo/keywords/apply', { kind: 'project', id: project.id, ...res.suggestion }).expect(200);
    expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { seoTitle: true } })).toEqual({ seoTitle: res.suggestion.seoTitle });
    // A landing page (any language) is found in the stored list and updated there.
    const onLanding = (await admin.post('/api/v1/admin/seo/keywords/suggest', { query: 'thuê căn hộ 2pn đà nẵng', page: 'https://dvg.test/en/cho-thue/nhu-cau/can-ho-2pn' }).expect(200)).body.data;
    expect(onLanding.target).toMatchObject({ kind: 'landing', purpose: 'rent', slug: 'can-ho-2pn' });
    await admin.post('/api/v1/admin/seo/keywords/apply', { kind: 'landing', purpose: 'rent', slug: 'can-ho-2pn', ...onLanding.suggestion }).expect(200);
    const stored = JSON.parse((await prisma.siteSetting.findUniqueOrThrow({ where: { key: 'seo.landings' } })).value as string);
    expect(stored[0]).toMatchObject({ slug: 'can-ho-2pn', seoTitle: onLanding.suggestion.seoTitle, h1: landing.h1 });
    await admin.post('/api/v1/admin/seo/keywords/suggest', { query: 'x y', page: 'https://dvg.test/blog' }).expect(400);
  });
});

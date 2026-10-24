import { createServer, type Server } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { createApp, createUser, login, resetDb } from './helpers.js';

/** Stand-in for the Gemini API (no network, no cost). */
let gemini: Server;
let reply: { status: number; body: unknown };
/** Replies served in order before falling back to `reply`. */
let queue: { status: number; body: unknown; hang?: boolean }[] = [];
const models: string[] = [];
let lastRequest: { url?: string; key?: string; body?: any };

let app: NestExpressApplication;
let prisma: PrismaService;

beforeAll(async () => {
  gemini = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      lastRequest = { url: req.url, key: req.headers['x-goog-api-key'] as string, body: JSON.parse(raw) };
      models.push(lastRequest.body.model);
      const next = queue.shift() ?? reply;
      // A model that never answers: the client must give up and move on.
      if ('hang' in next && next.hang) return;
      res.writeHead(next.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(next.body));
    });
  });
  await new Promise<void>((done) => gemini.listen(4199, '127.0.0.1', done));
  ({ app, prisma } = await createApp());
  await resetDb(prisma);
  await createUser(prisma, 'editor@dvg.test', 'editor');
  await createUser(prisma, 'sales@dvg.test', 'sales');
});
afterAll(async () => {
  await app.close();
  gemini.closeAllConnections();
  await new Promise((done) => gemini.close(done));
});

/** Interactions API response: text lives in steps[model_output].content[text]. */
const answer = (json: object) => ({
  status: 200,
  body: {
    status: 'completed',
    steps: [
      { type: 'thought', signature: 'x' },
      { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(json) }] },
    ],
  },
});
const post = { kind: 'post', title: 'Kinh nghiệm thuê căn hộ Đà Nẵng', summary: 'Những điều nên kiểm tra trước khi thuê.', content: 'Đoạn một.\n\nĐoạn hai về hợp đồng thuê.' };

describe('AI SEO suggestions', () => {
  it('sends the article to Gemini and returns trimmed, clean tags', async () => {
    reply = answer({
      seoTitle: 'Kinh nghiệm thuê căn hộ Đà Nẵng: 7 điều cần kiểm tra trước khi ký hợp đồng | Đất Vàng Group',
      seoDescription: '<b>Checklist</b> thuê căn hộ Đà Nẵng: vị trí, nội thất, hợp đồng và chi phí. Đọc ngay để chọn được căn phù hợp.',
      keywords: ['Thuê căn hộ Đà Nẵng', 'thuê căn hộ đà nẵng', 'kinh nghiệm thuê nhà'],
      imageAlt: 'Phòng khách căn hộ cho thuê tại Đà Nẵng',
    });
    const editor = await login(app, 'editor@dvg.test');
    const res = await editor.post('/api/v1/admin/ai/seo-suggest', post).expect(200);
    expect(res.body.data.seoTitle.length).toBeLessThanOrEqual(60);
    expect(res.body.data.seoDescription).not.toContain('<b>');
    expect(res.body.data.keywords).toEqual(['thuê căn hộ đà nẵng', 'kinh nghiệm thuê nhà']);
    expect(lastRequest.url).toBe('/v1beta/interactions');
    expect(lastRequest.key).toBe('test-gemini-key');
    expect(lastRequest.body.model).toBe('gemini-3.8-flash');
    expect(lastRequest.body.input).toContain('Đoạn hai về hợp đồng thuê.');
    expect(lastRequest.body.system_instruction).toContain('KHÔNG bịa');
    expect(lastRequest.body.response_format.mime_type).toBe('application/json');
    expect(await prisma.auditLog.count({ where: { action: 'ai.seo_suggest' } })).toBe(1);
    const status = await editor.get('/api/v1/admin/ai/status').expect(200);
    expect(status.body.data).toMatchObject({ seo: true, model: 'gemini-3.8-flash' });
  });

  it('reports Gemini failures clearly and never leaks the key', async () => {
    const editor = await login(app, 'editor@dvg.test');
    reply = { status: 403, body: { error: { status: 'PERMISSION_DENIED' } } };
    const denied = await editor.post('/api/v1/admin/ai/seo-suggest', post).expect(502);
    expect(denied.body.error.code).toBe('AI_UNAVAILABLE');
    expect(JSON.stringify(denied.body)).not.toContain('test-gemini-key');
    reply = { status: 200, body: { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'không phải JSON' }] }] } };
    await editor.post('/api/v1/admin/ai/seo-suggest', post).expect(502);
  });

  it('tries the fallback models in order when the main one is overloaded or hangs', async () => {
    const editor = await login(app, 'editor@dvg.test');
    models.length = 0;
    queue = [{ status: 503, body: { error: { code: 'service_unavailable' } } }];
    reply = answer({ seoTitle: 'Thuê căn hộ Đà Nẵng', seoDescription: 'Kinh nghiệm thuê căn hộ tại Đà Nẵng cho người mới.', keywords: [], imageAlt: '' });
    const res = await editor.post('/api/v1/admin/ai/seo-suggest', post).expect(200);
    expect(res.body.data.seoTitle).toBe('Thuê căn hộ Đà Nẵng');
    expect(models).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash']);
    // Main model hangs, first fallback over quota: the last one answers.
    models.length = 0;
    queue = [
      { status: 0, body: {}, hang: true },
      { status: 429, body: { error: { code: 'resource_exhausted' } } },
    ];
    await editor.post('/api/v1/admin/ai/seo-suggest', post).expect(200);
    expect(models).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']);
    // All overloaded: a clear, retryable message.
    queue = [
      { status: 503, body: {} },
      { status: 503, body: {} },
      { status: 503, body: {} },
    ];
    const busy = await editor.post('/api/v1/admin/ai/seo-suggest', post).expect(502);
    expect(busy.body.error.message).toMatch(/quá tải/);
  });

  it('requires write access to the content type', async () => {
    const sales = await login(app, 'sales@dvg.test');
    await sales.post('/api/v1/admin/ai/seo-suggest', post).expect(403);
  });
});

describe('website translation', () => {
  const secret = { 'x-revalidate-secret': process.env.REVALIDATE_SECRET! };
  const texts = ['Căn hộ cho thuê', 'Tìm căn hộ', '0911 29 69 79', '  Căn hộ   cho thuê '];
  const translate = (body: object, headers: Record<string, string> = secret) =>
    request(app.getHttpServer()).post('/api/v1/i18n/translate').set(headers).send(body);

  it('only the website server may request translations', async () => {
    await translate({ locale: 'en', texts }, {}).expect(403);
    await translate({ locale: 'en', texts }, { 'x-revalidate-secret': 'wrong-secret-wrong-secret' }).expect(403);
  });

  it('translates new strings once, then serves them from the database and the dictionary', async () => {
    models.length = 0;
    queue = [];
    reply = answer({ items: [{ i: 0, t: 'Apartments for rent' }, { i: 1, t: 'Find an apartment' }] });
    const first = await translate({ locale: 'en', texts }).expect(200);
    expect(first.body.data.translations).toEqual({
      'Căn hộ cho thuê': 'Apartments for rent',
      'Tìm căn hộ': 'Find an apartment',
      // Same text after whitespace normalisation: one cache entry.
      '  Căn hộ   cho thuê ': 'Apartments for rent',
    });
    expect(models).toEqual(['gemini-3.5-flash-lite']);
    expect(lastRequest.body.system_instruction).toContain('into English');
    expect(JSON.parse(lastRequest.body.input)).toEqual([
      { i: 0, vi: 'Căn hộ cho thuê' },
      { i: 1, vi: 'Tìm căn hộ' },
    ]);
    // Cached: Gemini is not called again, even if it is down.
    reply = { status: 503, body: {} };
    const second = await translate({ locale: 'en', texts }).expect(200);
    expect(second.body.data.translations['Tìm căn hộ']).toBe('Find an apartment');
    expect(models).toHaveLength(1);
    const dict = await request(app.getHttpServer()).get('/api/v1/i18n/dictionary?locale=en').expect(200);
    expect(dict.body.data.entries).toEqual({ 'Căn hộ cho thuê': 'Apartments for rent', 'Tìm căn hộ': 'Find an apartment' });
    expect(dict.body.data.version).toMatch(/^2-\d+$/);
  });

  it('editors correct a translation and AI never overwrites it', async () => {
    const editor = await login(app, 'editor@dvg.test');
    const list = await editor.get('/api/v1/admin/translations?locale=en&q=Tìm').expect(200);
    expect(list.body.meta.total).toBe(1);
    const row = list.body.data[0];
    const fixed = await editor
      .patch(`/api/v1/admin/translations/${row.id}`, { text: 'Search apartments', expectedUpdatedAt: row.updatedAt })
      .expect(200);
    expect(fixed.body.data).toMatchObject({ text: 'Search apartments', reviewed: true });
    await editor.patch(`/api/v1/admin/translations/${row.id}`, { text: 'Again', expectedUpdatedAt: row.updatedAt }).expect(409);
    const again = await translate({ locale: 'en', texts: ['Tìm căn hộ'] }).expect(200);
    expect(again.body.data.translations['Tìm căn hộ']).toBe('Search apartments');
    expect(await prisma.auditLog.count({ where: { action: 'translation.correct' } })).toBe(1);
    const sales = await login(app, 'sales@dvg.test');
    await sales.patch(`/api/v1/admin/translations/${row.id}`, { text: 'x' }).expect(403);
  });

  it('collects visible text from saved content, not identifiers', async () => {
    const { collectTexts } = await import('../src/modules/i18n/i18n.service.js');
    expect(
      collectTexts({
        name: 'Căn hộ view sông',
        slug: 'can-ho-view-song',
        description: 'Đoạn một về căn hộ.\n\nĐoạn hai về nội thất.',
        imageUrl: '/media/a.webp',
        projectId: '1a2b3c4d-1111-2222-3333-444455556666',
        banner: { title: 'Sống bên sông Hàn', mediaId: 'x' },
        priceVnd: '12000000',
      }),
    ).toEqual([
      'Căn hộ view sông',
      'Đoạn một về căn hộ.',
      'Đoạn hai về nội thất.',
      'Đoạn một về căn hộ. Đoạn hai về nội thất.',
      'Sống bên sông Hàn',
    ]);
  });

  it('leaves text untranslated when Gemini fails and rejects bad input', async () => {
    reply = { status: 503, body: {} };
    const res = await translate({ locale: 'ko', texts: ['Liên hệ'] }).expect(200);
    expect(res.body.data.translations).toEqual({});
    await translate({ locale: 'fr', texts: ['Liên hệ'] }).expect(400);
    await translate({ locale: 'en', texts: Array.from({ length: 301 }, (_, i) => `Dòng ${i}`) }).expect(400);
    const status = await request(app.getHttpServer()).get('/api/v1/i18n/status').expect(200);
    expect(status.body.data).toEqual({ enabled: true, locales: ['vi', 'en', 'ko', 'zh'] });
  });
});

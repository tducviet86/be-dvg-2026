import { createServer, type Server } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../src/database/prisma.service.js';
import { createApp, createUser, login, resetDb } from './helpers.js';

/** Stand-in for the Gemini API (no network, no cost). */
let gemini: Server;
let reply: { status: number; body: unknown };
/** Replies served in order before falling back to `reply`. */
let queue: { status: number; body: unknown }[] = [];
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

  it('retries once with the fallback model when the main one is overloaded', async () => {
    const editor = await login(app, 'editor@dvg.test');
    models.length = 0;
    queue = [{ status: 503, body: { error: { code: 'service_unavailable' } } }];
    reply = answer({ seoTitle: 'Thuê căn hộ Đà Nẵng', seoDescription: 'Kinh nghiệm thuê căn hộ tại Đà Nẵng cho người mới.', keywords: [], imageAlt: '' });
    const res = await editor.post('/api/v1/admin/ai/seo-suggest', post).expect(200);
    expect(res.body.data.seoTitle).toBe('Thuê căn hộ Đà Nẵng');
    expect(models).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash']);
    // Both overloaded: a clear, retryable message.
    queue = [
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

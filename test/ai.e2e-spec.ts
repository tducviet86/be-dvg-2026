import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { romanised, untranslated } from '../src/modules/i18n/i18n.service.js';
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

  it('drafts a unit title, an opening line and key points', async () => {
    const editor = await login(app, 'editor@dvg.test');
    models.length = 0;
    queue = [];
    reply = answer({
      title: 'Căn 2PN view sông Hàn, full nội thất tại Sun Panoma.',
      intro: 'Căn hộ 2 phòng ngủ view sông Hàn, nội thất đầy đủ.',
      points: ['- Phòng khách rộng, ban công hướng sông.', 'Bếp mở, đầy đủ thiết bị.', '', '• Phù hợp gia đình nhỏ.'],
    });
    const facts = 'Dự án: Sun Panoma\nLoại: 2 phòng ngủ\nDiện tích: 70 m²\nNội thất: Đầy đủ nội thất\nTiện nghi: Ban công, View sông';
    const res = await editor.post('/api/v1/admin/ai/unit-description', { facts, listing: 'rent' }).expect(200);
    expect(res.body.data.description).toBe(
      'Căn hộ 2 phòng ngủ view sông Hàn, nội thất đầy đủ.\n\n- Phòng khách rộng, ban công hướng sông.\n- Bếp mở, đầy đủ thiết bị.\n- Phù hợp gia đình nhỏ.',
    );
    // No trailing full stop on a title.
    expect(res.body.data.title).toBe('Căn 2PN view sông Hàn, full nội thất tại Sun Panoma');
    expect(lastRequest.body.input).toContain('Diện tích: 70 m²');
    expect(lastRequest.body.system_instruction).toContain('KHÔNG bịa');
    expect(lastRequest.body.system_instruction).toContain('khách tìm thuê');
    // A unit for sale is written for buyers, not tenants; so are its SEO tags.
    await editor.post('/api/v1/admin/ai/unit-description', { facts, listing: 'sale' }).expect(200);
    expect(lastRequest.body.system_instruction).toContain('"Bán căn"');
    expect(lastRequest.body.system_instruction).toContain('người mua');
    expect(lastRequest.body.system_instruction).not.toContain('khách tìm thuê');
    reply = answer({ seoTitle: 'Bán căn hộ 2PN Sun Panoma', seoDescription: 'Căn hộ 2 phòng ngủ 70 m² view sông Hàn tại Sun Panoma, đầy đủ nội thất. Liên hệ để xem nhà.', keywords: ['bán căn hộ sun panoma'], imageAlt: 'Căn hộ Sun Panoma' });
    const unitSeo = { kind: 'property', title: 'Bán căn 2PN Sun Panoma', summary: 'Căn hộ 2 phòng ngủ 70 m² view sông Hàn, đầy đủ nội thất.' };
    await editor.post('/api/v1/admin/ai/seo-suggest', { ...unitSeo, listing: 'sale' }).expect(200);
    expect(lastRequest.body.system_instruction).toContain('"mua căn hộ … đà nẵng"');
    await editor.post('/api/v1/admin/ai/seo-suggest', { ...unitSeo, listing: 'rent' }).expect(200);
    expect(lastRequest.body.system_instruction).toContain('"Cho thuê căn hộ"');
    await editor.post('/api/v1/admin/ai/seo-suggest', { ...unitSeo, listing: 'lease' }).expect(400);
    await editor.post('/api/v1/admin/ai/unit-description', { facts: 'ngắn', listing: 'rent' }).expect(400);
    const sales = await login(app, 'sales@dvg.test');
    await sales.post('/api/v1/admin/ai/unit-description', { facts, listing: 'rent' }).expect(403);
  });

  it('requires write access to the content type', async () => {
    const sales = await login(app, 'sales@dvg.test');
    await sales.post('/api/v1/admin/ai/seo-suggest', post).expect(403);
  });
});

describe('website translation', () => {
  it('accepts legal document numbers kept as written, not Vietnamese text', () => {
    expect(untranslated('뜨엉 2023년 주택법 및 시행령 95/2024/NĐ-CP에 따른 규정')).toBe(false);
    expect(untranslated('参考：2023年住房法、第95/2024/NĐ-CP号法令')).toBe(false);
    expect(untranslated('Nguồn tham khảo: Nghị định 95/2024/NĐ-CP')).toBe(true);
  });

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

  it('keeps Korean and Chinese prices that end with the đồng sign', async () => {
    queue = [];
    reply = answer({ items: [{ i: 0, t: '1개월 임대료 · 25.000.000 đ' }, { i: 1, t: '샵하우스 임대료는 월 25.000.000 đ입니다.' }] });
    const res = await translate({ locale: 'ko', texts: ['1 tháng tiền nhà · 25.000.000 đ', 'Giá cho thuê căn shophouse là 25.000.000 đ/tháng.'] }).expect(200);
    expect(res.body.data.translations).toEqual({
      '1 tháng tiền nhà · 25.000.000 đ': '1개월 임대료 · 25.000.000 đ',
      'Giá cho thuê căn shophouse là 25.000.000 đ/tháng.': '샵하우스 임대료는 월 25.000.000 đ입니다.',
    });
    // An answer that is still Vietnamese is dropped, đồng sign or not.
    reply = answer({ items: [{ i: 0, t: 'Giá thuê 30.000.000 đ' }] });
    expect((await translate({ locale: 'ko', texts: ['Giá thuê 30.000.000 đ'] }).expect(200)).body.data.translations).toEqual({});
    expect(lastRequest.body.system_instruction).toContain('"đ" after an amount → "동"');
  });

  it('the Hàn river has one Chinese name, in new translations and in stored ones', async () => {
    await translate({ locale: 'zh', texts: ['View sông Hàn kiểm tra'] }).expect(200);
    expect(lastRequest.body.system_instruction).toContain('"sông Hàn" → "瀚江"');
    const rows = [
      ['zh', 'Cầu Sông Hàn kiểm tra', '韩江大桥', '瀚江大桥'],
      ['zh', 'Ven sông Hàn, bờ Đông sông Hàn kiểm tra', '汉江畔，翰江东岸', '瀚江畔，瀚江东岸'],
      ['zh', 'Bên sông Hàn kiểm tra', '位于 Han江畔', '位于 瀚江畔'],
      ['zh', 'Căn hộ kiểm tra', '公寓', '公寓'],
      ['ko', 'Sông Hàn kiểm tra', '한강 汉江', '한강 汉江'],
    ];
    await prisma.translation.createMany({
      data: rows.map(([locale, source, text]) => ({ locale, source, text, sourceHash: createHash('sha256').update(source).digest('hex') })),
    });
    await prisma.$executeRawUnsafe(readFileSync('prisma/migrations/20261125090000_han_river_zh/migration.sql', 'utf8'));
    for (const [locale, source, , expected] of rows)
      expect((await prisma.translation.findFirstOrThrow({ where: { locale, source } })).text).toBe(expected);
  });

  it('model units and "2 PN +1" read the same everywhere, and old AI wordings go', async () => {
    for (const [locale, rule] of [
      ['en', '"Căn mẫu C4-01 2 PN +1" → "Model unit C4-01, 2+1 bedrooms"'],
      ['ko', '"2 PN +1" → "침실 2+1"'],
      ['zh', '"2 PN +1" → "2+1房"'],
    ]) {
      await translate({ locale, texts: ['Căn mẫu C9-01 2 PN +1 kiểm tra'] }).expect(200);
      expect(lastRequest.body.system_instruction).toContain(rule);
    }
    const rows: [string, string, string, boolean, boolean][] = [
      // locale, source, text, reviewed, kept
      ['en', 'Căn mẫu C9-02 kiểm tra', 'Sample unit C9-02', false, false],
      ['en', 'Xem căn mẫu kiểm tra', 'View sample unit', false, false],
      ['en', '78.5 m² · 2 PN +1 kiểm tra', '78.5 m² · 2 bedrooms +1', false, false],
      ['zh', '78.5 m² · 2 PN +1 kiểm tra', '78.5 m² · 2 卧室 +1', false, false],
      ['ko', 'Căn 2PN+1 kiểm tra', '침실 2개 +1', false, false],
      ['zh', 'Căn mẫu C9-03 kiểm tra', '样板房 C9-03', false, true],
      ['en', 'Căn mẫu C9-04 kiểm tra', 'Model unit C9-04, checked', true, true],
      ['en', 'Căn 2 phòng ngủ kiểm tra', '2-bedroom apartment', false, true],
    ];
    await prisma.translation.createMany({
      data: rows.map(([locale, source, text, reviewed]) => ({
        locale,
        source,
        text,
        reviewed,
        sourceHash: createHash('sha256').update(source).digest('hex'),
      })),
    });
    await prisma.$executeRawUnsafe(readFileSync('prisma/migrations/20261126100000_model_unit_translations/migration.sql', 'utf8'));
    for (const [locale, source, , , kept] of rows)
      expect(await prisma.translation.count({ where: { locale, source } })).toBe(kept ? 1 : 0);
  });

  it('"bàn giao thô" is not golf, and 3D models and floor plans of model units read well', async () => {
    for (const [locale, rule] of [
      ['ko', '"bàn giao thô" → "골조 상태 인도"'],
      ['en', '"Mô hình 3D Căn mẫu C6-09 1 PN" → "3D model of model unit C6-09, 1 bedroom"'],
      ['en', '"Mặt bằng Căn mẫu C6-09 1 PN" → "Floor plan of model unit C6-09, 1 bedroom"'],
    ]) {
      await translate({ locale, texts: ['Căn mẫu C9-05 bàn giao thô kiểm tra'] }).expect(200);
      expect(lastRequest.body.system_instruction).toContain(rule);
    }
    const rows: [string, string, string, boolean][] = [
      // locale, source, text, kept
      ['ko', 'Căn mẫu C9-06, bàn giao thô kiểm tra', '샘플 세대 C9-06, 골프조적 마감', false],
      ['ko', 'Căn mẫu C9-07, bàn giao thô kiểm tra', '샘플 세대 C9-07, 골프 쉘(골조) 마감', false],
      ['ko', 'Gần sân golf kiểm tra', '골프장 인근', true],
      ['ko', 'Căn mẫu C9-08, bàn giao thô kiểm tra', '샘플 세대 C9-08, 골조 상태 인도', true],
      ['en', 'Mô hình 3D Căn mẫu C9-09 1 PN kiểm tra', '3D Model Model unit C9-09 1 bedroom', false],
      ['en', 'Mặt bằng Căn mẫu C9-10 1 PN kiểm tra', 'Floor plan Model unit C9-10, 1 bedroom', false],
      ['en', 'Mặt bằng Căn mẫu C9-11 1 PN kiểm tra', 'Floor plan of model unit C9-11, 1 bedroom', true],
    ];
    await prisma.translation.createMany({
      data: rows.map(([locale, source, text]) => ({ locale, source, text, sourceHash: createHash('sha256').update(source).digest('hex') })),
    });
    await prisma.$executeRawUnsafe(readFileSync('prisma/migrations/20261126140000_model_unit_translation_fixes/migration.sql', 'utf8'));
    for (const [locale, source, , kept] of rows)
      expect(await prisma.translation.count({ where: { locale, source } })).toBe(kept ? 1 : 0);
  });

  it('thousands of "tỷ" are trillions, in new translations and in stored ones', async () => {
    for (const [locale, rule] of [
      ['en', '10.750 tỷ → 10.75 trillion VND'],
      ['ko', '10.750 tỷ → 10조 7,500억 동'],
      ['zh', '10.750 tỷ → 10.75万亿越南盾'],
    ]) {
      await translate({ locale, texts: ['Vốn 1.234 tỷ kiểm tra'] }).expect(200);
      expect(lastRequest.body.system_instruction).toContain(rule);
    }
    const rows = [
      ['zh', 'Gần 10.750 tỷ đồng kiểm tra', '近10.750十亿越南盾', '近10.75万亿越南盾'],
      ['zh', 'Đầu tư 10.500 tỷ kiểm tra', '投资10.500十亿越南盾', '投资10.5万亿越南盾'],
      ['zh', 'Vốn 7.359 tỷ kiểm tra', '总资金达7.359十亿越南盾', '总资金达7.359万亿越南盾'],
      ['zh', 'Giá 4,35 tỷ kiểm tra', '4.35十亿越南盾', '4.35十亿越南盾'],
      ['en', 'Gần 10.750 tỷ đồng kiểm tra', 'nearly 10.750 billion VND', 'nearly 10.75 trillion VND'],
      ['en', 'Vốn 10.750 tỷ kiểm tra', '10,750 billion VND', '10,750 billion VND'],
    ];
    await prisma.translation.createMany({
      data: rows.map(([locale, source, text]) => ({ locale, source, text, sourceHash: createHash('sha256').update(source).digest('hex') })),
    });
    await prisma.$executeRawUnsafe(readFileSync('prisma/migrations/20261125120000_trillion_translations/migration.sql', 'utf8'));
    for (const [locale, source, , expected] of rows)
      expect((await prisma.translation.findFirstOrThrow({ where: { locale, source } })).text).toBe(expected);
  });

  it('Korean and Chinese are never kept as pinyin, unaccented Vietnamese or English', async () => {
    const broken = [
      'Han jiang yan an fang di chan',
      'Sun Group 岘港 Han jiang yan an Sun Galaxy Complex',
      'Bon toa, bon mua',
      'Đất Vàng Group currently has 5 available apartments out of 6',
    ];
    const fine = ['位于 Tran Hung Dao 街', 'The Monarchy 全配家具公寓', '公寓 view 江 wifi', 'Azura Da Nang, Sun Ponte Residence', 'www.datvanggroup.vn/cho-thue/can-ho'];
    for (const text of broken) expect(romanised('zh', text), text).toBe(true);
    for (const text of fine) expect(romanised('zh', text), text).toBe(false);
    expect(romanised('en', broken[0])).toBe(false);
    expect(romanised('ko', 'gym, spa, yoga', 'gym, spa, yoga')).toBe(false);
    // Such an answer is dropped and asked for again later.
    reply = answer({ items: [{ i: 0, t: broken[0] }] });
    expect((await translate({ locale: 'zh', texts: ['Đất ven sông kiểm tra'] }).expect(200)).body.data.translations).toEqual({});
    // Stored ones go away, so they are translated again; staff corrections stay.
    const rows = [...broken, ...fine].map((text, i) => ({ locale: 'zh', source: `Câu kiểm tra ${i}`, text, reviewed: false }));
    rows.push({ locale: 'ko', source: 'Câu kiểm tra đã duyệt', text: broken[2], reviewed: true });
    rows.push({ locale: 'ko', source: 'gym, spa, yoga', text: 'gym, spa, yoga', reviewed: false });
    rows.push({ locale: 'en', source: 'Câu kiểm tra tiếng Anh', text: broken[3], reviewed: false });
    await prisma.translation.createMany({
      data: rows.map((r) => ({ ...r, sourceHash: createHash('sha256').update(r.source).digest('hex') })),
    });
    await prisma.$executeRawUnsafe(readFileSync('prisma/migrations/20261125091000_romanised_translations/migration.sql', 'utf8'));
    const left = await prisma.translation.findMany({ where: { source: { in: rows.map((r) => r.source) } } });
    expect(left.map((r) => r.text).sort()).toEqual(rows.slice(broken.length).map((r) => r.text).sort());
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

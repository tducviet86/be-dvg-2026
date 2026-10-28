import { createServer, type Server } from 'node:net';
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

/** Slugs end with the unit code: 'song-han-a' is unit 'A' of 'song-han'. */
const codeOf = (slug: string) => slug.split('-').pop()!.toUpperCase();

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

  it('emails the team about a new website request (reply goes to the customer)', async () => {
    // Minimal SMTP server: records what the API sends.
    const mails: { from: string; to: string[]; data: string }[] = [];
    const smtp: Server = createServer((socket) => {
      let current = { from: '', to: [] as string[], data: '' };
      let inData = false;
      let buffer = '';
      socket.write('220 test ESMTP\r\n');
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let index: number;
        while ((index = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          if (inData) {
            if (line === '.') {
              inData = false;
              mails.push(current);
              current = { from: '', to: [], data: '' };
              socket.write('250 queued\r\n');
            } else current.data += `${line}\n`;
          } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250 test\r\n');
          else if (/^MAIL FROM/i.test(line)) {
            current.from = line;
            socket.write('250 ok\r\n');
          }
          else if (/^RCPT TO/i.test(line)) {
            current.to.push(line);
            socket.write('250 ok\r\n');
          }
          else if (/^DATA/i.test(line)) {
            inData = true;
            socket.write('354 go\r\n');
          }
          else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n');
          else socket.write('250 ok\r\n');
        }
      });
    });
    await new Promise<void>((done) => smtp.listen(4198, '127.0.0.1', done));
    try {
      // No recipient configured: nothing is sent.
      await http().post('/api/v1/inquiries').send(form()).expect(202);
      await new Promise((r) => setTimeout(r, 300));
      expect(mails).toHaveLength(0);

      await prisma.siteSetting.upsert({
        where: { key: 'leads.notificationEmail' },
        create: { key: 'leads.notificationEmail', value: 'sale@dvg.test' },
        update: { value: 'sale@dvg.test' },
      });
      await prisma.project.create({ data: { slug: 'the-monarchy', name: 'The Monarchy', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.' } });
      await http()
        .post('/api/v1/inquiries')
        .send(form({ name: 'Lê <b>Khách</b>', message: 'Cần thuê căn 2 phòng ngủ từ tháng 11.', projectSlug: 'the-monarchy', intent: 'Tìm thuê bất động sản' }))
        .expect(202);
      await expect.poll(() => mails.length, { timeout: 5000 }).toBe(1);
      const mail = mails[0]!;
      expect(mail.to.join()).toContain('sale@dvg.test');
      const raw = mail.data.replace(/=\n/g, '');
      expect(raw).toMatch(/Reply-To: .*khach@example\.com/i);
      expect(raw).toContain('0911296979');
      expect(raw).toContain('/admin/leads/');
      // Customer text is escaped in the HTML part.
      expect(raw).not.toContain('<b>Kh');
    } finally {
      await new Promise((done) => smtp.close(done));
    }
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
    // Uploaded for a unit: the file is named after its code (easy to find in a backup).
    const named = await admin.agent
      .post('/api/v1/admin/media/upload')
      .set('x-csrf-token', admin.csrf)
      .field('owner', 'property')
      .field('code', 'MB029')
      .attach('file', png, { filename: 'x.png', contentType: 'image/png' })
      .expect(201);
    expect(named.body.data.key).toMatch(/^can-ho\/MB029\/MB029-\d{8}-[0-9a-f]{8}\.webp$/);
    // Codes are sanitised: no accents, spaces or path tricks.
    const odd = await admin.agent
      .post('/api/v1/admin/media/upload')
      .set('x-csrf-token', admin.csrf)
      .field('owner', 'project')
      .field('code', 'Tòa Đông/../../etc')
      .attach('file', png, { filename: 'x.png', contentType: 'image/png' })
      .expect(201);
    expect(odd.body.data.key).toMatch(/^du-an\/Toa-Dong-etc\/Toa-Dong-etc-\d{8}-[0-9a-f]{8}\.webp$/);
    await admin.agent.post('/api/v1/admin/media/upload').set('x-csrf-token', admin.csrf).field('owner', 'x').attach('file', png, { filename: 'x.png', contentType: 'image/png' }).expect(400);
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
    // Clearing the date of a scheduled post publishes it now; a live post keeps its date.
    const later = await admin.post('/api/v1/admin/blog/posts', { slug: 'bai-hen', title: 'Bài hẹn', excerpt: 'Tóm tắt bài hẹn đủ dài.', content: 'Nội dung bài hẹn đủ dài.', category: 'tin-doanh-nghiep', status: 'PUBLISHED', publishedAt: future }).expect(201);
    await http().get('/api/v1/blog/bai-hen').expect(404);
    await admin.patch(`/api/v1/admin/blog/posts/${later.body.data.id}`, { publishedAt: null }).expect(200);
    await http().get('/api/v1/blog/bai-hen').expect(200);
    const live = (await http().get('/api/v1/blog/bai-viet').expect(200)).body.data.publishedAt;
    await admin.patch(`/api/v1/admin/blog/posts/${created.body.data.id}`, { publishedAt: null }).expect(200);
    expect((await http().get('/api/v1/blog/bai-viet').expect(200)).body.data.publishedAt).toBe(live);
  });
});

describe('properties', () => {
  it('filters published units and keeps demo units out of the sitemap', async () => {
    const project = await prisma.project.create({ data: { slug: 'monarchy', name: 'The Monarchy', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.', status: 'PUBLISHED', publishedAt: new Date() } });
    const type = await prisma.propertyType.findUniqueOrThrow({ where: { code: '2pn' } });
    const unit = (slug: string, rent: string, extra = {}) => admin.post('/api/v1/admin/properties', { slug, unitCode: codeOf(slug), name: `Căn ${slug}`, projectId: project.id, propertyType: '2pn', location: 'Sơn Trà, Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Căn hộ hướng sông Hàn.', rentPriceVnd: rent, status: 'PUBLISHED', ...extra }).expect(201);
    await unit('song-han-a', '15000000');
    await unit('song-han-b', '25000000', { isDemo: true });
    await unit('song-han-c', '9000000', { status: 'DRAFT' });
    const cheap = await http().get('/api/v1/properties?maxRentVnd=20000000&project=monarchy').expect(200);
    expect(cheap.body.data.map((p: { slug: string }) => p.slug)).toEqual(['song-han-a']);
    const search = await http().get(`/api/v1/properties?q=${encodeURIComponent('song han monarchy')}&sort=price-desc`).expect(200);
    expect(search.body.data.map((p: { slug: string }) => p.slug)).toEqual(['song-han-b', 'song-han-a']);
    expect((await http().get('/api/v1/sitemap').expect(200)).body.data.properties.map((p: { slug: string }) => p.slug)).toEqual(['song-han-a']);
    expect(type.code).toBe('2pn');
    // Admin lists the unit created last first, even a draft with no publish date.
    const adminList = (await admin.get('/api/v1/admin/properties').expect(200)).body.data.map((p: { slug: string }) => p.slug);
    expect(adminList.slice(0, 3)).toEqual(['song-han-c', 'song-han-b', 'song-han-a']);
    const slugs = async (query: string) => (await admin.get(`/api/v1/admin/properties?${query}`).expect(200)).body.data.map((p: { slug: string }) => p.slug);
    expect(await slugs('project=monarchy&sort=price-asc')).toEqual(['song-han-c', 'song-han-a', 'song-han-b']);
    expect(await slugs('project=monarchy&sort=name')).toEqual(['song-han-a', 'song-han-b', 'song-han-c']);
    expect(await slugs('project=monarchy&status=DRAFT')).toEqual(['song-han-c']);
    expect(await slugs('project=monarchy&highlight=none')).toHaveLength(3);
    await admin.get('/api/v1/admin/properties?sort=views').expect(400);
    // Summary cards: archived units are not counted.
    const stats = (await admin.get('/api/v1/admin/properties/stats').expect(200)).body.data;
    expect(stats).toMatchObject({ published: 2, draft: 1, availability: { AVAILABLE: 3 }, highlighted: 0, demo: 1 });
    expect(stats.total).toBe(3);
    await admin.post('/api/v1/admin/properties', { slug: 'x-1', name: 'Căn X', projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Mô tả đủ dài.', rentPriceVnd: '1.5' }).expect(400);
  });

  it('makes the slug from the name and unit code, and the code when it is empty', async () => {
    const project = await prisma.project.create({ data: { slug: 'ponte', name: 'Sun Ponte', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.' } });
    const base = { name: 'Căn 2PN view sông Hàn', projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Căn hộ hướng sông Hàn.' };
    const create = (extra = {}) => admin.post('/api/v1/admin/properties', { ...base, ...extra }).expect(201).then((r) => r.body.data);
    const first = await create();
    // No code typed: "DVG-" + the last 4 characters of the id, also ending the slug.
    expect(first.unitCode).toBe(`DVG-${first.id.replace(/-/g, '').slice(-4).toUpperCase()}`);
    expect(first.slug).toBe(`can-2pn-view-song-han-${first.unitCode.toLowerCase()}`);
    // The admin list says who created and last changed each unit.
    const admins = await prisma.user.findMany({ select: { name: true } });
    expect(admins.map((u) => u.name)).toContain(first.createdBy);
    expect(first.updatedBy).toBe(first.createdBy);
    const seeded = (await admin.get('/api/v1/admin/properties?project=ponte').expect(200)).body.data[0];
    expect(seeded.createdBy).toEqual(expect.any(String));
    // The slug always ends with the unit code; the same code twice gets a number.
    const second = await create({ unitCode: 'A-12.05' });
    expect(second).toMatchObject({ slug: 'can-2pn-view-song-han-a-12-05', unitCode: 'A-12.05' });
    const third = await create({ unitCode: 'A-12.05' });
    expect(third.slug).toBe('can-2pn-view-song-han-a-12-05-2');
    // A typed slug gets the code too.
    const typed = await create({ slug: 'can-2pn-view-song-han', unitCode: 'B-03' });
    expect(typed.slug).toBe('can-2pn-view-song-han-b-03');
    // Saving with the code cleared gives the unit a code again; an unchanged slug stays.
    const saved = await admin.patch(`/api/v1/admin/properties/${second.id}`, { unitCode: null }).expect(200);
    expect(saved.body.data).toMatchObject({ slug: 'can-2pn-view-song-han-a-12-05', unitCode: `DVG-${second.id.replace(/-/g, '').slice(-4).toUpperCase()}` });
    const renamed = await admin.patch(`/api/v1/admin/properties/${typed.id}`, { slug: 'can-2pn-view-song-han' }).expect(200);
    expect(renamed.body.data.slug).toBe('can-2pn-view-song-han-b-03');
    // A slug already ending with the code (as the editor sends it) keeps one code.
    const moved = await admin.patch(`/api/v1/admin/properties/${typed.id}`, { slug: 'can-moi-b-03' }).expect(200);
    expect(moved.body.data.slug).toBe('can-moi-b-03');
  });

  it('shows the editor badge and marks units many visitors look at as trending', async () => {
    const project = await prisma.project.create({ data: { slug: 'panoma', name: 'Sun Panoma', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.', status: 'PUBLISHED', publishedAt: new Date() } });
    const unit = (slug: string, extra = {}) =>
      admin.post('/api/v1/admin/properties', { slug, unitCode: codeOf(slug), name: `Căn ${slug}`, projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Căn hộ hướng sông Hàn.', rentPriceVnd: '15000000', status: 'PUBLISHED', ...extra }).expect(201);
    const { body } = await unit('pn-hot', { highlight: 'exclusive' });
    await unit('pn-demo', { isDemo: true });
    await admin.post('/api/v1/admin/properties', { slug: 'pn-bad', name: 'Căn sai', projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Mô tả đủ dài.', highlight: 'sieu-hot' }).expect(400);
    const browser = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';
    const view = (slug: string, ua = browser) => http().post(`/api/v1/properties/${slug}/view`).set('user-agent', ua).expect(204);
    // 10 visits + 2 enquiries (worth 5 views each) reach the trending score of 20.
    for (let n = 0; n < 9; n++) await view('pn-hot');
    await view('pn-hot', 'Googlebot/2.1 (+http://www.google.com/bot.html)'); // not counted
    await view('pn-demo'); // samples are not counted
    await view('khong-ton-tai'); // unknown slug: silently ignored
    let unitBody = (await http().get('/api/v1/properties/pn-hot').expect(200)).body.data;
    expect(unitBody).toMatchObject({ highlight: 'exclusive', trending: false, interestScore: 9 });
    await view('pn-hot');
    for (const email of ['a@example.com', 'b@example.com'])
      await prisma.lead.create({ data: { kind: 'INQUIRY', source: 'Tư vấn căn hộ', name: 'Khách', email, message: 'Tôi muốn xem căn.', propertyId: body.data.id, consentAt: new Date() } });
    unitBody = (await http().get('/api/v1/properties/pn-hot').expect(200)).body.data;
    expect(unitBody.trending).toBe(true);
    expect(unitBody.interestScore).toBe(20);
    const list = (await http().get('/api/v1/properties?project=panoma').expect(200)).body.data;
    expect(list.find((p: { slug: string }) => p.slug === 'pn-hot').trending).toBe(true);
    const adminUnit = (await admin.get(`/api/v1/admin/properties/${body.data.id}`).expect(200)).body.data;
    expect(adminUnit.interest).toEqual({ days: 14, views: 10, leads: 2 });
    expect(await prisma.propertyViewDay.count()).toBe(1);
    // The badge can be removed again.
    await admin.patch(`/api/v1/admin/properties/${body.data.id}`, { highlight: null }).expect(200);
    expect((await http().get('/api/v1/properties/pn-hot').expect(200)).body.data.highlight).toBeNull();
  });
});

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createServer, type Server } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import type request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { PropertiesService } from '../src/modules/properties/properties.service.js';
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

  it('accepts a request without a message and writes one from the need, project and unit', async () => {
    const project = await prisma.project.create({ data: { slug: 'sun-ponte', name: 'Sun Ponte', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.' } });
    await http()
      .post('/api/v1/contact')
      .send(form({ message: undefined, intent: 'Ký gửi bán hoặc cho thuê', source: 'Hợp tác chủ sở hữu' }))
      .expect(202);
    await http()
      .post('/api/v1/inquiries')
      .send(form({ email: 'b@example.com', message: '   ', intent: 'Tìm thuê bất động sản', projectSlug: 'sun-ponte' }))
      .expect(202);
    // No intent either: the source names the request.
    await http().post('/api/v1/contact').send(form({ email: 'c@example.com', message: undefined })).expect(202);
    const leads = await prisma.lead.findMany({ orderBy: { createdAt: 'asc' } });
    expect(leads.map((l) => [l.intent, l.source, l.message])).toEqual([
      ['Ký gửi bán hoặc cho thuê', 'Hợp tác chủ sở hữu', 'Ký gửi bán hoặc cho thuê'],
      ['Tìm thuê bất động sản', 'Tư vấn', 'Tìm thuê bất động sản · Dự án Sun Ponte'],
      [null, 'Liên hệ', 'Liên hệ'],
    ]);
    expect(leads[1]!.projectId).toBe(project.id);
    // The same request again within minutes is a duplicate.
    await http()
      .post('/api/v1/inquiries')
      .send(form({ email: 'b@example.com', message: undefined, intent: 'Tìm thuê bất động sản', projectSlug: 'sun-ponte' }))
      .expect(202);
    expect(await prisma.lead.count()).toBe(3);
    // The same need sent from another form is a new request.
    await http()
      .post('/api/v1/inquiries')
      .send(form({ email: 'b@example.com', message: undefined, intent: 'Tìm thuê bất động sản', projectSlug: 'sun-ponte', source: 'Dịch vụ: Quản lý' }))
      .expect(202);
    expect(await prisma.lead.count()).toBe(4);
    // A unit page: the unit and its project.
    const made = await admin.post('/api/v1/admin/properties', { slug: 'sun-ponte-a', unitCode: 'A', name: 'Căn hộ 2PN view sông', projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Căn hộ hướng sông Hàn.', rentPriceVnd: '15000000', status: 'PUBLISHED' }).expect(201);
    await http()
      .post('/api/v1/inquiries')
      .send(form({ email: 'd@example.com', message: undefined, intent: 'Tìm thuê bất động sản', propertySlug: made.body.data.slug }))
      .expect(202);
    expect(await prisma.lead.findFirstOrThrow({ where: { email: 'd@example.com' } })).toMatchObject({
      projectId: project.id,
      message: 'Tìm thuê bất động sản · Căn hộ 2PN view sông (mã A)',
    });
    // Over-long messages are still refused.
    await http().post('/api/v1/contact').send(form({ message: 'x'.repeat(1501) })).expect(400);
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

  it('shows where each file is used and deletes unused files from storage too', async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#2a5c4a' } }).png().toBuffer();
    const upload = async () =>
      (await admin.agent.post('/api/v1/admin/media/upload').set('x-csrf-token', admin.csrf).attach('file', png, { filename: 'x.png', contentType: 'image/png' }).expect(201)).body.data;
    const [inArticle, spare, other] = [await upload(), await upload(), await upload()];
    // A photo pasted into an article counts as used, like a cover.
    await admin.post('/api/v1/admin/blog/posts', {
      slug: 'bai-co-anh', title: 'Bài có ảnh', excerpt: 'Tóm tắt bài có ảnh chèn.', category: 'tin-doanh-nghiep',
      content: `Đoạn mở đầu.\n\n![Phòng khách](${inArticle.url})\n\nĐoạn cuối.`,
    }).expect(201);
    const blocked = await admin.del(`/api/v1/admin/media/${inArticle.id}`).expect(409);
    expect(blocked.body.error.details.posts).toBe(1);
    const usage = await admin.get(`/api/v1/admin/media/${inArticle.id}/usage`).expect(200);
    expect(usage.body.data.places).toEqual([{ kind: 'posts', id: expect.any(String), label: 'Bài có ảnh' }]);
    // The library lists usage and filters unused files.
    const unused = (await admin.get('/api/v1/admin/media?usage=unused&pageSize=100').expect(200)).body.data.map((m: { id: string }) => m.id);
    expect(unused).toEqual(expect.arrayContaining([spare.id, other.id]));
    expect(unused).not.toContain(inArticle.id);
    const used = (await admin.get('/api/v1/admin/media?usage=used&pageSize=100').expect(200)).body.data;
    expect(used.find((m: { id: string }) => m.id === inArticle.id)).toMatchObject({ used: true, usage: { posts: 1 } });
    const before = (await admin.get('/api/v1/admin/media/stats').expect(200)).body.data;
    expect(before.unused).toBeGreaterThanOrEqual(2);
    expect(before.bytes).toBeGreaterThan(0);
    // Deleting several: unused ones go (database and stored file), the used one stays.
    const stored = join(process.env.LOCAL_MEDIA_DIR!, spare.key);
    expect(existsSync(stored)).toBe(true);
    const res = await admin.post('/api/v1/admin/media/delete', { ids: [spare.id, other.id, inArticle.id] }).expect(200);
    expect(res.body.data).toMatchObject({ deleted: 2, kept: [inArticle.id] });
    expect(existsSync(stored)).toBe(false);
    expect(await prisma.mediaAsset.count({ where: { id: { in: [spare.id, other.id] } } })).toBe(0);
    const after = (await admin.get('/api/v1/admin/media/stats').expect(200)).body.data;
    expect(after.unused).toBe(before.unused - 2);
    await admin.post('/api/v1/admin/media/delete', { ids: ['khong-phai-id'] }).expect(400);
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
  it('a townhouse or premises can stand outside any project, with its own place on the map', async () => {
    const base = { name: 'Nhà phố Euro Village', propertyType: 'nha-pho', location: 'Euro Village, Sơn Trà, Đà Nẵng', areaM2: 100, bedrooms: 3, bathrooms: 3, description: 'Nhà phố trong khu Euro Village.', rentPriceVnd: '30000000', status: 'PUBLISHED' };
    // No project and no place: refused; an apartment always needs a project.
    await admin.post('/api/v1/admin/properties', base).expect(400);
    await admin.post('/api/v1/admin/properties', { ...base, latitude: 16.06 }).expect(400);
    await admin.post('/api/v1/admin/properties', { ...base, propertyType: '2pn', latitude: 16.06, longitude: 108.24 }).expect(400);
    const made = await admin.post('/api/v1/admin/properties', { ...base, slug: 'nha-pho-euro', latitude: 16.0612, longitude: 108.2401 }).expect(201);
    expect(made.body.data).toMatchObject({ project: null, projectId: null, latitude: 16.0612, longitude: 108.2401 });
    // Shown on the site, its page and the sitemap like any unit.
    const list = (await http().get('/api/v1/properties?listing=rent').expect(200)).body.data;
    const slug = made.body.data.slug;
    expect(list.map((u: { slug: string }) => u.slug)).toContain(slug);
    expect((await http().get(`/api/v1/properties/${slug}`).expect(200)).body.data.project).toBeNull();
    expect(JSON.stringify((await http().get('/api/v1/sitemap').expect(200)).body)).toContain(slug);
    // Taking the place away is refused; it keeps standing on its own.
    const id = made.body.data.id;
    await admin.patch(`/api/v1/admin/properties/${id}`, { latitude: null, longitude: null }).expect(400);
    await admin.patch(`/api/v1/admin/properties/${id}`, { propertyType: '2pn' }).expect(400);
    await admin.patch(`/api/v1/admin/properties/${id}`, { name: 'Nhà phố Euro Village 2' }).expect(200);
  });

  it('filters published units and keeps demo units out of the sitemap', async () => {
    const project = await prisma.project.create({ data: { slug: 'monarchy', name: 'The Monarchy', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.', status: 'PUBLISHED', publishedAt: new Date() } });
    const type = await prisma.propertyType.findUniqueOrThrow({ where: { code: '2pn' } });
    const unit = (slug: string, rent: string, extra = {}) => admin.post('/api/v1/admin/properties', { slug, unitCode: codeOf(slug), name: `Căn ${slug}`, projectId: project.id, propertyType: '2pn', location: 'Sơn Trà, Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Căn hộ hướng sông Hàn.', rentPriceVnd: rent, status: 'PUBLISHED', ...extra }).expect(201);
    const a = (await unit('song-han-a', '15000000')).body.data.slug;
    await unit('song-han-b', '25000000', { isDemo: true });
    await unit('song-han-c', '9000000', { status: 'DRAFT' });
    // Units are told apart by name ("Căn song-han-a"): slugs end with the public code.
    const names = (body: { data: { name: string }[] }) => body.data.map((p) => p.name.slice(4));
    const cheap = await http().get('/api/v1/properties?maxRentVnd=20000000&project=monarchy').expect(200);
    expect(names(cheap.body)).toEqual(['song-han-a']);
    const search = await http().get(`/api/v1/properties?q=${encodeURIComponent('song han monarchy')}&sort=price-desc`).expect(200);
    expect(names(search.body)).toEqual(['song-han-b', 'song-han-a']);
    expect((await http().get('/api/v1/sitemap').expect(200)).body.data.properties.map((p: { slug: string }) => p.slug)).toEqual([a]);
    expect(type.code).toBe('2pn');
    // Admin lists the unit created last first, even a draft with no publish date.
    const adminList = names((await admin.get('/api/v1/admin/properties').expect(200)).body);
    expect(adminList.slice(0, 3)).toEqual(['song-han-c', 'song-han-b', 'song-han-a']);
    const slugs = async (query: string) => names((await admin.get(`/api/v1/admin/properties?${query}`).expect(200)).body);
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

  it('lists model apartments apart from the units posted for rent or sale', async () => {
    const project = await prisma.project.create({ data: { slug: 'capital', name: 'Capital', location: 'Đà Nẵng', intro: 'Dự án kiểm tra.', status: 'PUBLISHED' } });
    const unit = (slug: string, floorNote?: string) =>
      admin.post('/api/v1/admin/properties', { slug, name: slug, projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Căn kiểm tra danh sách.', floorNote, status: 'PUBLISHED' }).expect(201);
    await unit('can-thue');
    await unit('can-mau', 'Tầng 5-10');
    const names = async (kind: string) =>
      (await admin.get(`/api/v1/admin/properties?kind=${kind}`).expect(200)).body.data.map((u: { name: string }) => u.name);
    expect(await names('unit')).toEqual(['can-thue']);
    expect(await names('model')).toEqual(['can-mau']);
    const stats = (await admin.get('/api/v1/admin/properties/stats?kind=unit').expect(200)).body.data;
    expect(stats).toMatchObject({ total: 1, kinds: { unit: 1, model: 1 } });
    await admin.get('/api/v1/admin/properties?kind=other').expect(400);
  });

  it('takes units rented a few days ago off the site and back when free again', async () => {
    const project = await prisma.project.create({ data: { slug: 'monarchy', name: 'The Monarchy', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.', status: 'PUBLISHED', publishedAt: new Date() } });
    const unit = (slug: string) => admin.post('/api/v1/admin/properties', { slug, unitCode: codeOf(slug), name: `Căn ${slug}`, projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Căn hộ hướng sông Hàn.', rentPriceVnd: '15000000', status: 'PUBLISHED' }).expect(201).then((r) => r.body.data);
    const fresh = await unit('song-han-a');
    const old = await unit('song-han-b');
    const free = await unit('song-han-c');
    await admin.patch(`/api/v1/admin/properties/${fresh.id}`, { availability: 'RENTED' }).expect(200);
    await admin.patch(`/api/v1/admin/properties/${old.id}`, { availability: 'RENTED' }).expect(200);
    // The status change is stamped; another edit leaves the stamp alone.
    const stamped = await prisma.property.findUniqueOrThrow({ where: { id: old.id } });
    await admin.patch(`/api/v1/admin/properties/${old.id}`, { availability: 'RENTED', name: 'Căn song-han-b mới' }).expect(200);
    expect((await prisma.property.findUniqueOrThrow({ where: { id: old.id } })).availabilityChangedAt).toEqual(stamped.availabilityChangedAt);
    // Rented 6 days ago: past RENTED_HIDE_DAYS (5).
    await prisma.property.update({ where: { id: old.id }, data: { availabilityChangedAt: new Date(Date.now() - 6 * 86_400_000) } });

    // Units are told apart by name ("Căn song-han-a"): slugs end with the public code.
    const names = (body: { data: { name: string }[] }) => body.data.map((p) => p.name.slice(4)).sort();
    const site = async () => names((await http().get('/api/v1/properties').expect(200)).body);
    expect(await site()).toEqual(['song-han-a', 'song-han-c']);
    expect((await http().get('/api/v1/sitemap').expect(200)).body.data.properties.map((p: { slug: string }) => p.slug).sort()).toEqual([fresh.slug, free.slug].sort());
    // Its page still opens (old links), marked so it is not indexed.
    const page = (await http().get(`/api/v1/properties/${old.slug}`).expect(200)).body.data;
    expect(page).toMatchObject({ availability: 'RENTED', delisted: true });
    expect((await http().get(`/api/v1/properties/${fresh.slug}`).expect(200)).body.data.delisted).toBe(false);

    // Admin: the default list leaves it to "Đã cho thuê"; a search still finds it.
    const slugs = async (query = '') => names((await admin.get(`/api/v1/admin/properties?${query}`).expect(200)).body);
    expect(await slugs()).toEqual(['song-han-a', 'song-han-c']);
    expect(await slugs('availability=RENTED')).toEqual(['song-han-a', 'song-han-b mới']);
    expect(await slugs('q=song-han-b')).toEqual(['song-han-b mới']);
    const stats = (await admin.get('/api/v1/admin/properties/stats').expect(200)).body.data;
    expect(stats).toMatchObject({ total: 3, availability: { RENTED: 2, AVAILABLE: 1 }, delisted: 1, hideDays: 5 });

    // Free again: back on the site at once.
    await admin.patch(`/api/v1/admin/properties/${old.id}`, { availability: 'AVAILABLE' }).expect(200);
    expect(await site()).toEqual(['song-han-a', 'song-han-b mới', 'song-han-c']);
    expect(free.availability).toBe('AVAILABLE');
  });

  it('groups unit types: apartments (shophouse too), townhouses, premises, offices', async () => {
    const types = (await http().get('/api/v1/property-types').expect(200)).body.data as { code: string; name: string; group: string }[];
    const group = (g: string) => types.filter((t) => t.group === g).map((t) => t.code);
    expect(group('apartment')).toEqual(expect.arrayContaining(['studio', '1pn', '2pn', '3pn', 'shophouse']));
    expect(types.find((t) => t.code === 'nha-pho')).toMatchObject({ name: 'Nhà phố', group: 'townhouse' });
    expect(group('townhouse')).toEqual(['nha-pho']);
    expect(types.find((t) => t.code === 'mat-bang')).toMatchObject({ name: 'Mặt bằng', group: 'premises' });
    expect(types.find((t) => t.code === 'van-phong')).toMatchObject({ name: 'Văn phòng', group: 'office' });
    const project = await prisma.project.create({ data: { slug: 'euro', name: 'Phúc Lộc Viên', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.', status: 'PUBLISHED', publishedAt: new Date() } });
    const made = await admin.post('/api/v1/admin/properties', { slug: 'mat-bang-a', unitCode: 'A', name: 'Mặt bằng mặt tiền', projectId: project.id, propertyType: 'mat-bang', location: 'Đà Nẵng', areaM2: 120, bedrooms: 0, bathrooms: 1, description: 'Mặt bằng kinh doanh mặt tiền.', rentPriceVnd: '30000000', status: 'PUBLISHED' }).expect(201);
    const unit = (await http().get(`/api/v1/properties/${made.body.data.slug}`).expect(200)).body.data;
    expect(unit.propertyType).toEqual({ code: 'mat-bang', name: 'Mặt bằng', group: 'premises' });
  });

  it('records which costs the rent already covers', async () => {
    const project = await prisma.project.create({ data: { slug: 'fees', name: 'Dự án phí', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.', status: 'PUBLISHED', publishedAt: new Date() } });
    const base = { slug: 'phi-a', unitCode: 'A', name: 'Căn có phí', projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Căn hộ hướng sông Hàn.', status: 'PUBLISHED' };
    await admin.post('/api/v1/admin/properties', { ...base, includedFees: ['water', 'wifi'] }).expect(400);
    const unit = (await admin.post('/api/v1/admin/properties', { ...base, includedFees: ['water', 'internet'] }).expect(201)).body.data;
    expect((await http().get(`/api/v1/properties/${unit.slug}`).expect(200)).body.data.includedFees).toEqual(['water', 'internet']);
    await admin.patch(`/api/v1/admin/properties/${unit.id}`, { includedFees: [] }).expect(200);
    expect((await http().get(`/api/v1/properties/${unit.slug}`).expect(200)).body.data.includedFees).toEqual([]);
  });

  it("visitors see neither a unit's real code nor its floor; Admin sees both", async () => {
    const project = await prisma.project.create({
      data: { slug: 'ponte', name: 'Sun Ponte', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.', status: 'PUBLISHED', publishedAt: new Date(), codePrefix: 'SP', towers: [{ name: 'T1', floors: 24 }] },
    });
    const base = { name: 'Căn 2PN tầng 19 view sông Hàn', projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, tower: 'T1', floor: 19, description: 'Căn 1905 nằm ở tầng 19 tòa T1, nhìn ra sông.', status: 'PUBLISHED' };
    const create = (extra = {}) => admin.post('/api/v1/admin/properties', { ...base, ...extra }).expect(201).then((r) => r.body.data);
    const unit = await create({ unitCode: '1905' });
    // Admin: the real code and floor, the public code, and what visitors read.
    expect(unit).toMatchObject({ unitCode: '1905', floor: 19, publicCode: expect.stringMatching(/^SP-\d{5}$/), floorBand: 'high' });
    expect(unit.publicView).toMatchObject({ name: 'Căn 2PN tầng cao view sông Hàn', floor: 'tầng cao', leaks: [] });
    expect(unit.publicView.description).toBe(`Căn ${unit.publicCode} nằm ở tầng cao tòa T1, nhìn ra sông.`);
    // The slug ends with the public code, never the real one or the floor.
    expect(unit.slug).toBe(`can-2pn-view-song-han-${unit.publicCode.toLowerCase()}`);
    const page = (await http().get(`/api/v1/properties/${unit.slug}`).expect(200)).body.data;
    expect(page).toMatchObject({ unitCode: unit.publicCode, floor: null, floorBand: 'high', name: 'Căn 2PN tầng cao view sông Hàn' });
    expect(JSON.stringify(page)).not.toMatch(/1905|tầng 19/);
    // The site's search finds it by its public code, not by the real one or the floor.
    const search = async (q: string) => (await http().get(`/api/v1/properties?q=${encodeURIComponent(q)}`).expect(200)).body.data.length;
    expect(await search(unit.publicCode)).toBe(1);
    expect(await search('1905')).toBe(0);
    const indexed = await prisma.property.findUniqueOrThrow({ where: { id: unit.id }, select: { publicSearchText: true } });
    expect(indexed.publicSearchText).not.toMatch(/1905|tang 19/);
    expect((await admin.get('/api/v1/admin/properties?q=1905').expect(200)).body.data).toHaveLength(1);
    // Staff find it by the code the visitor reads out too.
    expect((await admin.get(`/api/v1/admin/properties?q=${unit.publicCode}`).expect(200)).body.data.map((u: { id: string }) => u.id)).toEqual([unit.id]);
    // Another unit with the same code: its own number, its own slug.
    const twin = await create({ unitCode: '1905' });
    expect(twin.publicCode).not.toBe(unit.publicCode);
    // A floor written in words is pointed out to Admin.
    const odd = await create({ unitCode: '2207', floor: 22, description: 'Căn ở lầu hai mươi hai, mã T22.' });
    expect(odd.publicView.leaks).toEqual(expect.arrayContaining(['lầu hai mươi hai', 'T22']));
    // A low floor of the tower.
    expect((await create({ unitCode: '0503', floor: 5 })).floorBand).toBe('low');
    // A townhouse's floors are its size: said as is, in its slug and texts too.
    const house = await create({ name: 'Nhà phố 3 tầng gần sông', projectId: null, propertyType: 'nha-pho', latitude: 16.06, longitude: 108.22, tower: undefined, unitCode: 'NP-1234', floor: 3, description: 'Nhà 3 tầng, phòng ngủ ở tầng 2.' });
    expect(house).toMatchObject({ floorBand: null, publicView: { name: 'Nhà phố 3 tầng gần sông', leaks: [] } });
    expect(house.slug).toMatch(/^nha-pho-3-tang-gan-song-dv-\d{5}$/);
    expect((await http().get(`/api/v1/properties/${house.slug}`).expect(200)).body.data).toMatchObject({ floor: 3, floorBand: null, unitCode: expect.stringMatching(/^DV-\d{5}$/), description: 'Nhà 3 tầng, phòng ngủ ở tầng 2.' });
    // Model units are the developer's layouts: they keep their code.
    const model = await create({ name: 'Căn mẫu C4-01 2 PN', unitCode: 'C4-01', floor: undefined, floorNote: 'Tầng 5-10', description: 'Căn mẫu C4-01 áp dụng tầng 5-10.' });
    expect(model.slug).toBe('can-mau-c4-01-2-pn-c4-01');
    expect((await http().get(`/api/v1/properties/${model.slug}`).expect(200)).body.data).toMatchObject({ unitCode: 'C4-01', name: 'Căn mẫu C4-01 2 PN' });
    // Units saved before: a slug with the real code or floor is replaced on start-up; the old link redirects.
    await prisma.property.update({ where: { id: twin.id }, data: { slug: 'can-cu-tang-19-1905', publicSearchText: '' } });
    await app.get(PropertiesService).onApplicationBootstrap();
    const moved = await prisma.property.findUniqueOrThrow({ where: { id: twin.id } });
    expect(moved.slug).toBe(`can-cu-${twin.publicCode.toLowerCase()}`);
    const old = await http().get('/api/v1/properties/can-cu-tang-19-1905').redirects(0).expect(301);
    expect(old.headers.location).toContain(`/properties/${moved.slug}`);
    expect(moved.publicSearchText).toContain(twin.publicCode.toLowerCase());
    // Translations of the texts saved before (real code, floor) leave the public dictionary.
    const rows = [
      ['Căn 1905 nằm ở tầng 19 tòa T1, nhìn ra sông.', false],
      ['Căn 2PN tầng 19 view sông Hàn', false],
      ['Mã 1905 kiểm tra', false],
      ['Căn mẫu C4-01 áp dụng tầng 5-10.', true],
      ['Căn hộ hướng sông Hàn.', true],
      ['Tòa B cao 33 tầng', true],
    ] as const;
    await prisma.translation.createMany({
      data: rows.map(([source]) => ({ locale: 'en', source, text: `EN ${source}`, sourceHash: `h-${source}` })),
      skipDuplicates: true,
    });
    await prisma.$executeRawUnsafe(readFileSync('prisma/migrations/20261126171000_public_unit_translations/migration.sql', 'utf8'));
    for (const [source, kept] of rows) expect(await prisma.translation.count({ where: { locale: 'en', source } })).toBe(kept ? 1 : 0);
    // Photos stored under the real code move under the public one (npm run units:public-media).
    const dir = process.env.LOCAL_MEDIA_DIR!;
    // Upper case as typed in Admin ("12B11"), like many stored files.
    await prisma.property.update({ where: { id: unit.id }, data: { unitCode: '1905B' } });
    const oldKey = 'can-ho/1905B/1905B-20261126-abcdef12.webp';
    mkdirSync(join(dir, 'can-ho/1905B'), { recursive: true });
    writeFileSync(join(dir, oldKey), 'photo');
    const photo = await prisma.mediaAsset.create({ data: { storage: 'LOCAL', key: oldKey, url: `http://localhost:4000/media/${oldKey}`, mimeType: 'image/webp', sizeBytes: 5 } });
    await prisma.property.update({ where: { id: unit.id }, data: { coverImageId: photo.id, description: `Ảnh ![phòng](http://localhost:4000/media/${oldKey})` } });
    const run = (...args: string[]) => execFileSync('npx', ['tsx', 'scripts/public-media-keys.ts', ...args], { env: process.env }).toString();
    expect(run()).toContain('1 tệp sẽ đổi tên');
    expect(existsSync(join(dir, oldKey))).toBe(true);
    run('--apply');
    const newKey = `can-ho/${unit.publicCode.toLowerCase()}/${unit.publicCode.toLowerCase()}-20261126-abcdef12.webp`;
    expect(await prisma.mediaAsset.findUniqueOrThrow({ where: { id: photo.id } })).toMatchObject({ key: newKey, url: `http://localhost:4000/media/${newKey}` });
    expect(existsSync(join(dir, newKey))).toBe(true);
    expect(existsSync(join(dir, oldKey))).toBe(false);
    expect((await prisma.property.findUniqueOrThrow({ where: { id: unit.id } })).description).toContain(newKey);
    expect(run()).toContain('0 tệp sẽ đổi tên');
  });

  it('shows the editor badge and marks units many visitors look at as trending', async () => {
    const project = await prisma.project.create({ data: { slug: 'panoma', name: 'Sun Panoma', location: 'Đà Nẵng', intro: 'Giới thiệu dự án.', status: 'PUBLISHED', publishedAt: new Date() } });
    const unit = (slug: string, extra = {}) =>
      admin.post('/api/v1/admin/properties', { slug, unitCode: codeOf(slug), name: `Căn ${slug}`, projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Căn hộ hướng sông Hàn.', rentPriceVnd: '15000000', status: 'PUBLISHED', ...extra }).expect(201);
    const { body } = await unit('pn-hot', { highlight: 'exclusive' });
    // Slugs end with the public code: use the ones the API gave.
    const hot = body.data.slug as string;
    const demo = (await unit('pn-demo', { isDemo: true })).body.data.slug as string;
    await admin.post('/api/v1/admin/properties', { slug: 'pn-bad', name: 'Căn sai', projectId: project.id, propertyType: '2pn', location: 'Đà Nẵng', areaM2: 70, bedrooms: 2, bathrooms: 2, description: 'Mô tả đủ dài.', highlight: 'sieu-hot' }).expect(400);
    const browser = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';
    const view = (slug: string, ua = browser) => http().post(`/api/v1/properties/${slug}/view`).set('user-agent', ua).expect(204);
    // 10 visits + 4 enquiries (worth 5 views each) reach the trending score of 30.
    for (let n = 0; n < 9; n++) await view(hot);
    await view(hot, 'Googlebot/2.1 (+http://www.google.com/bot.html)'); // not counted
    await view(demo); // samples are not counted
    await view('khong-ton-tai'); // unknown slug: silently ignored
    let unitBody = (await http().get(`/api/v1/properties/${hot}`).expect(200)).body.data;
    expect(unitBody).toMatchObject({ highlight: 'exclusive', trending: false, interestScore: 9 });
    await view(hot);
    for (const email of ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com'])
      await prisma.lead.create({ data: { kind: 'INQUIRY', source: 'Tư vấn căn hộ', name: 'Khách', email, message: 'Tôi muốn xem căn.', propertyId: body.data.id, consentAt: new Date() } });
    unitBody = (await http().get(`/api/v1/properties/${hot}`).expect(200)).body.data;
    expect(unitBody.trending).toBe(true);
    expect(unitBody.interestScore).toBe(30);
    const list = (await http().get('/api/v1/properties?project=panoma').expect(200)).body.data;
    expect(list.find((p: { name: string }) => p.name === 'Căn pn-hot').trending).toBe(true);
    const adminUnit = (await admin.get(`/api/v1/admin/properties/${body.data.id}`).expect(200)).body.data;
    expect(adminUnit.interest).toEqual({ days: 14, views: 10, leads: 4 });
    expect(await prisma.propertyViewDay.count()).toBe(1);
    // Each view also keeps where it came from; an unknown source is "other".
    await http().post(`/api/v1/properties/${hot}/view?source=ai`).set('user-agent', browser).expect(204);
    await http().post(`/api/v1/properties/${hot}/view?source=evil%27--`).set('user-agent', browser).expect(204);
    const sources = await prisma.propertyViewSource.findMany({ select: { source: true, views: true }, orderBy: { source: 'asc' } });
    expect(sources).toEqual([
      { source: 'ai', views: 1 },
      { source: 'other', views: 11 },
    ]);
    // Each view is also kept one by one for "Lượt xem gần đây": where from,
    // language and kind of device only (no IP, no user agent).
    await http().post(`/api/v1/properties/${hot}/view?source=zalo&locale=ko`).set('user-agent', browser).expect(204);
    await http().post(`/api/v1/properties/${hot}/view?locale=xx`).set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130').expect(204);
    expect(await prisma.propertyView.count()).toBe(14);
    const recent = (await admin.get('/api/v1/admin/dashboard?days=7').expect(200)).body.data.recentViews;
    expect(recent).toHaveLength(14);
    expect(recent[0]).toMatchObject({ source: 'other', locale: 'vi', device: 'desktop', path: `/cho-thue/${hot}`, name: 'Căn pn-hot' });
    expect(recent[1]).toMatchObject({ source: 'zalo', locale: 'ko', device: 'mobile' });
    expect(Object.keys(recent[0]).sort()).toEqual(['at', 'device', 'id', 'locale', 'name', 'path', 'project', 'source', 'unitCode']);
    // The badge can be removed again.
    await admin.patch(`/api/v1/admin/properties/${body.data.id}`, { highlight: null }).expect(200);
    expect((await http().get(`/api/v1/properties/${hot}`).expect(200)).body.data.highlight).toBeNull();
  });
});

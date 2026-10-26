import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { createApp, createUser, login, resetDb } from './helpers.js';

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

const PDF = Buffer.from('%PDF-1.4\n% CV thử\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const job = (over: Record<string, unknown> = {}) => ({
  slug: 'chuyen-vien-kinh-doanh',
  title: 'Chuyên viên kinh doanh',
  department: 'Kinh doanh',
  location: 'Sơn Trà, Đà Nẵng',
  employmentType: 'FULL_TIME',
  salaryMinVnd: '10000000',
  salaryMaxVnd: '20000000',
  salaryNote: '+ hoa hồng',
  openings: 3,
  summary: 'Tư vấn cho thuê căn hộ cao cấp tại Đà Nẵng.',
  description: 'Tiếp nhận khách hàng.\nDẫn khách xem căn hộ.',
  requirements: 'Giao tiếp tốt.\nCó xe máy.',
  benefits: 'Lương cứng + hoa hồng.\nĐào tạo bài bản.',
  status: 'PUBLISHED',
  ...over,
});
const apply = (fields: Record<string, string>, file: Buffer | null = PDF, name = 'cv.pdf') => {
  const req = http().post('/api/v1/jobs/apply').set('user-agent', 'Mozilla/5.0');
  for (const [k, v] of Object.entries({ name: 'Trần Minh Anh', email: 'Ung.Vien@example.com', phone: '0911296979', consent: 'true', elapsedMs: '9000', ...fields }))
    req.field(k, v);
  return file ? req.attach('cv', file, name) : req;
};

describe('job postings', () => {
  it('publishes jobs, searches and filters them, and hides closed or draft ones', async () => {
    await admin.post('/api/v1/admin/jobs', job()).expect(201);
    await admin.post('/api/v1/admin/jobs', job({ slug: 'phien-dich-tieng-han', title: 'Phiên dịch tiếng Hàn', department: 'Phiên dịch', employmentType: 'PART_TIME' })).expect(201);
    await admin.post('/api/v1/admin/jobs', job({ slug: 'marketing-nhap', title: 'Chuyên viên marketing', department: 'Marketing', status: 'DRAFT' })).expect(201);
    await admin.post('/api/v1/admin/jobs', job({ slug: 'het-han', title: 'Kế toán', department: 'Kế toán', deadline: '2020-01-01' })).expect(201);
    await admin.post('/api/v1/admin/jobs', job({ slug: 'sai-luong', salaryMinVnd: '30000000' })).expect(400);

    const all = (await http().get('/api/v1/jobs').expect(200)).body;
    expect(all.data.map((j: { slug: string }) => j.slug).sort()).toEqual(['chuyen-vien-kinh-doanh', 'phien-dich-tieng-han']);
    expect(all.meta.departments).toEqual(['Kinh doanh', 'Phiên dịch']);
    const search = (await http().get(`/api/v1/jobs?q=${encodeURIComponent('phiên dịch')}`).expect(200)).body.data;
    expect(search.map((j: { slug: string }) => j.slug)).toEqual(['phien-dich-tieng-han']);
    const partTime = (await http().get('/api/v1/jobs?type=PART_TIME').expect(200)).body.data;
    expect(partTime).toHaveLength(1);
    const byDept = (await http().get(`/api/v1/jobs?department=${encodeURIComponent('Kinh doanh')}`).expect(200)).body.data;
    expect(byDept[0]).toMatchObject({ title: 'Chuyên viên kinh doanh', salaryMinVnd: '10000000', isOpen: true });

    // A closed posting stays readable but says it is closed; drafts are hidden.
    expect((await http().get('/api/v1/jobs/het-han').expect(200)).body.data.isOpen).toBe(false);
    await http().get('/api/v1/jobs/marketing-nhap').expect(404);

    const list = (await admin.get('/api/v1/admin/jobs').expect(200)).body;
    expect(list.meta.total).toBe(4);
    const id = list.data.find((j: { slug: string }) => j.slug === 'phien-dich-tieng-han').id;
    await admin.del(`/api/v1/admin/jobs/${id}`).expect(204);
    expect((await http().get('/api/v1/jobs').expect(200)).body.data).toHaveLength(1);
  });

  it('accepts applications with a CV that only staff can download', async () => {
    await admin.post('/api/v1/admin/jobs', job()).expect(201);
    await admin.post('/api/v1/admin/jobs', job({ slug: 'het-han', deadline: '2020-01-01' })).expect(201);

    await apply({ jobSlug: 'chuyen-vien-kinh-doanh', message: 'Tôi có 2 năm kinh nghiệm.' }).expect(202);
    // Same person, same posting within minutes: kept once.
    await apply({ jobSlug: 'chuyen-vien-kinh-doanh' }).expect(202);
    // General application (no posting).
    await apply({ email: 'khac@example.com' }, PDF, 'CV Ứng viên.pdf').expect(202);
    expect((await prisma.jobApplication.findFirstOrThrow({ where: { email: 'khac@example.com' } })).cvName).toBe('CV Ứng viên.pdf');
    // Refused: no CV, a disguised file, a closed posting, no consent.
    await apply({ email: 'a@example.com' }, null).expect(400);
    await apply({ email: 'b@example.com' }, Buffer.from('MZ fake program'), 'cv.pdf').expect(400);
    await apply({ email: 'c@example.com', jobSlug: 'het-han' }).expect(400);
    await apply({ email: 'd@example.com', consent: 'false' }).expect(400);
    // Bots (honeypot filled) are dropped silently.
    await apply({ email: 'bot@example.com', website: 'http://spam' }).expect(202);

    const apps = (await admin.get('/api/v1/admin/job-applications').expect(200)).body;
    expect(apps.meta.total).toBe(2);
    expect(apps.data[1]).toMatchObject({ name: 'Trần Minh Anh', email: 'ung.vien@example.com', cvMime: 'application/pdf', job: { title: 'Chuyên viên kinh doanh' } });
    expect(apps.data[1].cvData).toBeUndefined();
    const id = apps.data[1].id;

    const file = await admin.get(`/api/v1/admin/job-applications/${id}/cv`).expect(200);
    expect(file.headers['content-disposition']).toContain('attachment');
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await http().get(`/api/v1/admin/job-applications/${id}/cv`).expect(401);

    await admin.patch(`/api/v1/admin/job-applications/${id}`, { status: 'INTERVIEW', notes: 'Hẹn phỏng vấn thứ 2.' }).expect(200);
    expect((await admin.get('/api/v1/admin/job-applications?status=INTERVIEW').expect(200)).body.data).toHaveLength(1);
    const jobs = (await admin.get('/api/v1/admin/jobs').expect(200)).body.data;
    expect(jobs.find((j: { slug: string }) => j.slug === 'chuyen-vien-kinh-doanh').applicationCount).toBe(1);

    await admin.del(`/api/v1/admin/job-applications/${id}`).expect(204);
    expect(await prisma.jobApplication.count()).toBe(1);
  });
});

describe('pages and services', () => {
  const page = (over: Record<string, unknown> = {}) => ({
    path: 'gioi-thieu/lich-su',
    title: 'Lịch sử hình thành',
    intro: 'Chặng đường phát triển của Đất Vàng Group.',
    sections: [{ heading: '2018', body: 'Thành lập công ty.' }],
    status: 'PUBLISHED',
    ...over,
  });

  it('edits company pages and keeps built-in URLs free', async () => {
    const created = (await admin.post('/api/v1/admin/pages', page()).expect(201)).body.data;
    expect((await http().get('/api/v1/pages/gioi-thieu/lich-su').expect(200)).body.data.sections).toEqual([{ heading: '2018', body: 'Thành lập công ty.' }]);
    const reserved = await admin.post('/api/v1/admin/pages', page({ path: 'cho-thue/abc' })).expect(400);
    expect(reserved.body.error.details[0].field).toBe('path');
    await admin.post('/api/v1/admin/pages', page({ path: 'tuyen-dung/abc' })).expect(400);
    await admin.post('/api/v1/admin/pages', page()).expect(409);

    const listed = (await admin.get('/api/v1/admin/pages?kind=PAGE&q=lịch').expect(200)).body;
    expect(listed.data.map((p: { path: string }) => p.path)).toEqual(['gioi-thieu/lich-su']);
    await admin.del(`/api/v1/admin/pages/${created.id}`).expect(204);
    await http().get('/api/v1/pages/gioi-thieu/lich-su').expect(404);
  });

  it('lists services in order for the menu and the services page', async () => {
    // Reference data creates the six services once.
    const seeded = (await http().get('/api/v1/services').expect(200)).body.data;
    expect(seeded).toHaveLength(6);
    expect(seeded.filter((s: { inMenu: boolean }) => s.inMenu).map((s: { path: string }) => s.path)).toEqual([
      'dich-vu/quan-ly-bat-dong-san',
      'dich-vu/khai-thac-cho-thue',
      'dich-vu/hop-tac-chu-so-huu',
      'dich-vu/tu-van-dau-tu',
    ]);
    await admin.post('/api/v1/admin/pages', page({ kind: 'SERVICE', path: 'dich-vu/moi-gioi', title: 'Môi giới', sortOrder: 1, inMenu: true, summary: 'Mua bán căn hộ' })).expect(201);
    await admin.post('/api/v1/admin/pages', page({ kind: 'SERVICE', path: 'gioi-thieu/sai' })).expect(400);
    const services = (await http().get('/api/v1/services').expect(200)).body.data;
    expect(services[0]).toMatchObject({ path: 'dich-vu/moi-gioi', summary: 'Mua bán căn hộ', inMenu: true });
  });
});

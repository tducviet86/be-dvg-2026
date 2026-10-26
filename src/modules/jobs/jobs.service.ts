import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { assertFresh, publishedWhere, publishFields } from '../../common/utils/content.js';
import { isoDate, money, toBigInt } from '../../common/utils/serialize.js';
import { AppConfig } from '../../config/config.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobApplication, JobPosting, Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { I18nService } from '../i18n/i18n.service.js';
import { MailService } from '../mail/mail.service.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';
import type { AdminJobQuery, ApplicationQuery, ApplyDto, CreateJobDto, PublicJobQuery, UpdateApplicationDto, UpdateJobDto } from './jobs.dto.js';

/** CV upload limit (also enforced by multer in the controller). */
export const MAX_CV_BYTES = 5 * 1024 * 1024;
const MIN_FILL_MS = 2500;
type Ctx = { ip?: string; userAgent?: string };
type Cv = { buffer: Buffer; originalname: string; size: number };

export const EMPLOYMENT_LABEL = { FULL_TIME: 'Toàn thời gian', PART_TIME: 'Bán thời gian', INTERNSHIP: 'Thực tập', CONTRACT: 'Hợp đồng / cộng tác' } as const;

/** Today in Vietnam as a DATE value (deadlines are calendar days). */
const today = () => new Date(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10));
/** Published and still accepting applications. */
const openWhere = (): Prisma.JobPostingWhereInput => ({ ...publishedWhere(), OR: [{ deadline: null }, { deadline: { gte: today() } }] });
const isOpen = (j: JobPosting) => j.status === 'PUBLISHED' && !j.deletedAt && (!j.deadline || j.deadline >= today());

/** Recognises PDF and Word files by their first bytes, not by their name. */
function cvType(file: Cv): string | null {
  const head = file.buffer.subarray(0, 8);
  const name = file.originalname.toLowerCase();
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (head.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) && name.endsWith('.doc')) return 'application/msword';
  if (head.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && name.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return null;
}
/**
 * Keeps a readable, header-safe file name. Multer reads multipart file names
 * as Latin-1, so a UTF-8 name ("CV Ứng viên.pdf") is decoded back first.
 */
const safeName = (name: string) => {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return (utf8.includes('\uFFFD') ? name : utf8)
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\r\n]+/g, '-')
    .slice(-120) || 'cv';
};

function toPublic(j: JobPosting) {
  return {
    id: j.id,
    slug: j.slug,
    title: j.title,
    department: j.department,
    location: j.location,
    employmentType: j.employmentType,
    salaryMinVnd: money(j.salaryMinVnd),
    salaryMaxVnd: money(j.salaryMaxVnd),
    salaryNote: j.salaryNote,
    openings: j.openings,
    deadline: isoDate(j.deadline),
    isOpen: isOpen(j),
    summary: j.summary,
    description: j.description,
    requirements: j.requirements,
    benefits: j.benefits,
    seo: { title: j.seoTitle, description: j.seoDescription },
    publishedAt: j.publishedAt,
    updatedAt: j.updatedAt,
  };
}
const toAdmin = (j: JobPosting & { _count?: { applications: number } }) => ({
  ...toPublic(j),
  status: j.status,
  seoTitle: j.seoTitle,
  seoDescription: j.seoDescription,
  applicationCount: j._count?.applications ?? 0,
  createdAt: j.createdAt,
});
const applicationSelect = {
  id: true,
  jobId: true,
  name: true,
  email: true,
  phone: true,
  message: true,
  cvName: true,
  cvMime: true,
  cvSize: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  job: { select: { id: true, slug: true, title: true } },
} as const satisfies Prisma.JobApplicationSelect;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly revalidation: RevalidationService,
    private readonly i18n: I18nService,
  ) {}

  // ── Public ──────────────────────────────────────────────────────────────

  async publicList(q: PublicJobQuery) {
    const words = (q.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
    const where: Prisma.JobPostingWhereInput = {
      AND: [
        openWhere(),
        ...(q.department ? [{ department: q.department }] : []),
        ...(q.type ? [{ employmentType: q.type }] : []),
        // Every word must appear in the title, department or place.
        ...words.map((w) => ({
          OR: [
            { title: { contains: w, mode: 'insensitive' as const } },
            { department: { contains: w, mode: 'insensitive' as const } },
            { location: { contains: w, mode: 'insensitive' as const } },
          ],
        })),
      ],
    };
    const [rows, total, departments] = await Promise.all([
      this.prisma.jobPosting.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.jobPosting.count({ where }),
      this.prisma.jobPosting.findMany({ where: openWhere(), distinct: ['department'], select: { department: true }, orderBy: { department: 'asc' } }),
    ]);
    return { data: rows.map(toPublic), meta: { ...pageMeta(q.page, q.pageSize, total), departments: departments.map((d) => d.department) } };
  }

  /** Published postings stay readable after the deadline (marked closed). */
  async publicBySlug(slug: string) {
    const job = await this.prisma.jobPosting.findFirst({ where: { slug, ...publishedWhere() } });
    if (!job) throw notFound('Không tìm thấy tin tuyển dụng.');
    return toPublic(job);
  }

  async apply(dto: ApplyDto, file: Cv | undefined, ctx: Ctx) {
    // Bots: accepted silently so they learn nothing.
    if (dto.website?.trim() || (dto.elapsedMs !== undefined && dto.elapsedMs < MIN_FILL_MS)) return;
    let job: JobPosting | null = null;
    if (dto.jobSlug) {
      job = await this.prisma.jobPosting.findFirst({ where: { slug: dto.jobSlug, ...openWhere() } });
      if (!job) throw badRequest('Tin tuyển dụng này đã đóng. Bạn có thể gửi hồ sơ ứng tuyển chung.');
    }
    if (!file?.size) throw badRequest('Vui lòng đính kèm CV (PDF, DOC hoặc DOCX).', [{ field: 'cv', constraints: ['cv'], messages: ['Vui lòng đính kèm CV.'] }]);
    if (file.size > MAX_CV_BYTES) throw badRequest('CV tối đa 5 MB.', [{ field: 'cv', constraints: ['cv'], messages: ['CV tối đa 5 MB.'] }]);
    const mime = cvType(file);
    if (!mime) throw badRequest('CV cần là tệp PDF, DOC hoặc DOCX.', [{ field: 'cv', constraints: ['cv'], messages: ['CV cần là tệp PDF, DOC hoặc DOCX.'] }]);
    const email = dto.email.trim().toLowerCase();
    // The same person sending the same posting twice in 10 minutes: keep one.
    const recent = await this.prisma.jobApplication.findFirst({
      where: { email, jobId: job?.id ?? null, createdAt: { gte: new Date(Date.now() - 600_000) } },
      select: { id: true },
    });
    if (recent) return;
    const salt = this.config.get('IP_HASH_SALT');
    const application = await this.prisma.jobApplication.create({
      data: {
        jobId: job?.id,
        name: dto.name,
        email,
        phone: dto.phone,
        message: dto.message || null,
        cvData: new Uint8Array(file.buffer),
        cvName: safeName(file.originalname),
        cvMime: mime,
        cvSize: file.size,
        consentAt: new Date(),
        ipHash: ctx.ip ? createHash('sha256').update(`${salt}:${ctx.ip}`).digest('hex') : null,
        userAgent: ctx.userAgent?.slice(0, 300),
      },
      select: { id: true },
    });
    void this.notify(application.id);
  }

  // ── Admin: postings ─────────────────────────────────────────────────────

  async adminList(q: AdminJobQuery) {
    const where: Prisma.JobPostingWhereInput = {
      deletedAt: null,
      status: q.status,
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { department: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.jobPosting.findMany({
        where,
        include: { _count: { select: { applications: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.jobPosting.count({ where }),
    ]);
    return { data: rows.map(toAdmin), meta: pageMeta(q.page, q.pageSize, total) };
  }

  async adminGet(id: string) {
    const row = await this.prisma.jobPosting.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { applications: true } } } });
    if (!row) throw notFound('Không tìm thấy tin tuyển dụng.');
    return toAdmin(row);
  }

  async create(dto: CreateJobDto, user: AuthUser) {
    this.checkPublish(dto.status, user);
    if (await this.prisma.jobPosting.findUnique({ where: { slug: dto.slug }, select: { id: true } })) throw conflict('Đường dẫn đã được dùng cho tin khác.');
    const job = await this.prisma.jobPosting.create({ data: { ...this.data(dto), ...publishFields(dto.status ?? 'DRAFT') } as Prisma.JobPostingCreateInput });
    await this.audit.log({ actorId: user.id, action: 'job.create', entityType: 'job', entityId: job.id, changes: { slug: job.slug } });
    await this.saved(dto);
    return toAdmin(job);
  }

  async update(id: string, dto: UpdateJobDto, user: AuthUser) {
    const existing = await this.prisma.jobPosting.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound('Không tìm thấy tin tuyển dụng.');
    assertFresh(existing.updatedAt, dto.expectedUpdatedAt);
    if (dto.status && dto.status !== existing.status) this.checkPublish(dto.status, user, true);
    if (dto.slug && dto.slug !== existing.slug && (await this.prisma.jobPosting.findUnique({ where: { slug: dto.slug }, select: { id: true } })))
      throw conflict('Đường dẫn đã được dùng cho tin khác.');
    const job = await this.prisma.jobPosting.update({ where: { id }, data: { ...this.data(dto), ...publishFields(dto.status, existing) } });
    await this.audit.log({ actorId: user.id, action: 'job.update', entityType: 'job', entityId: id, changes: { slug: job.slug, status: job.status } });
    await this.saved(dto);
    return toAdmin(job);
  }

  async archive(id: string, user: AuthUser) {
    this.checkPublish('ARCHIVED', user, true);
    const existing = await this.prisma.jobPosting.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound('Không tìm thấy tin tuyển dụng.');
    await this.prisma.jobPosting.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } });
    await this.audit.log({ actorId: user.id, action: 'job.archive', entityType: 'job', entityId: id, changes: { slug: existing.slug } });
    await this.revalidation.trigger('jobs');
  }

  // ── Admin: applications ─────────────────────────────────────────────────

  async applications(q: ApplicationQuery) {
    const where: Prisma.JobApplicationWhereInput = {
      jobId: q.jobId,
      status: q.status,
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] }
        : {}),
    };
    const [rows, total, byStatus] = await Promise.all([
      this.prisma.jobApplication.findMany({ where, select: applicationSelect, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.jobApplication.count({ where }),
      this.prisma.jobApplication.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      data: rows,
      meta: { ...pageMeta(q.page, q.pageSize, total), byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) },
    };
  }

  async updateApplication(id: string, dto: UpdateApplicationDto, user: AuthUser) {
    const existing = await this.prisma.jobApplication.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!existing) throw notFound('Không tìm thấy hồ sơ.');
    const row = await this.prisma.jobApplication.update({ where: { id }, data: dto, select: applicationSelect });
    await this.audit.log({ actorId: user.id, action: 'application.update', entityType: 'application', entityId: id, changes: { from: existing.status, to: row.status } });
    return row;
  }

  async cv(id: string, user: AuthUser): Promise<Pick<JobApplication, 'cvData' | 'cvName' | 'cvMime'>> {
    const row = await this.prisma.jobApplication.findUnique({ where: { id }, select: { cvData: true, cvName: true, cvMime: true } });
    if (!row?.cvData) throw notFound('Hồ sơ không có CV.');
    await this.audit.log({ actorId: user.id, action: 'application.cv_download', entityType: 'application', entityId: id });
    return row;
  }

  /** Deletes the application and its CV for good (candidate privacy). */
  async removeApplication(id: string, user: AuthUser) {
    const existing = await this.prisma.jobApplication.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound('Không tìm thấy hồ sơ.');
    await this.prisma.jobApplication.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, action: 'application.delete', entityType: 'application', entityId: id });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private checkPublish(status: string | undefined, user: AuthUser, changing = false) {
    if ((changing || status === 'PUBLISHED') && status && !user.permissions.includes(PERMISSIONS.publish))
      throw forbidden('Bạn không có quyền xuất bản hoặc gỡ xuất bản.');
  }

  private data(dto: UpdateJobDto) {
    const { expectedUpdatedAt: _e, status: _s, salaryMinVnd, salaryMaxVnd, deadline, ...rest } = dto;
    const min = salaryMinVnd === undefined ? undefined : toBigInt(salaryMinVnd);
    const max = salaryMaxVnd === undefined ? undefined : toBigInt(salaryMaxVnd);
    if (min != null && max != null && min > max) throw badRequest('Lương tối thiểu lớn hơn lương tối đa.');
    return {
      ...rest,
      salaryMinVnd: min,
      salaryMaxVnd: max,
      deadline: deadline === undefined ? undefined : deadline === null ? null : new Date(`${deadline.slice(0, 10)}T00:00:00Z`),
    };
  }

  private async saved(dto: UpdateJobDto) {
    await this.revalidation.trigger('jobs');
    this.i18n.queueContent({ title: dto.title, department: dto.department, location: dto.location, summary: dto.summary, salaryNote: dto.salaryNote });
  }

  /** Recipient: Admin › Cài đặt › "Email tiếp nhận yêu cầu", else LEADS_NOTIFY_EMAIL. */
  private async notify(id: string) {
    try {
      if (!this.mail.enabled) return;
      const setting = await this.prisma.siteSetting.findUnique({ where: { key: 'leads.notificationEmail' } });
      const to = (typeof setting?.value === 'string' ? setting.value.trim() : '') || this.config.get('LEADS_NOTIFY_EMAIL');
      if (!to) return;
      const a = await this.prisma.jobApplication.findUnique({ where: { id }, include: { job: { select: { title: true } } } });
      if (!a) return;
      const site = this.config.get('SITE_URL').replace(/\/$/, '');
      const position = a.job?.title ?? 'Ứng tuyển chung';
      const rows: [string, string][] = [
        ['Vị trí', position],
        ['Ứng viên', a.name],
        ['Số điện thoại', a.phone],
        ['Email', a.email],
        ['Thời gian', a.createdAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })],
      ];
      const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      const adminUrl = `${site}/admin/applications`;
      await this.mail.send({
        to,
        replyTo: a.email,
        subject: `[Tuyển dụng] ${position} — ${a.name}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2d27;max-width:560px">
<h2 style="color:#0d3128;margin:0 0 12px">Hồ sơ ứng tuyển mới</h2>
<table cellpadding="8" style="border-collapse:collapse;width:100%;border:1px solid #e0e4d9">
${rows.map(([k, v]) => `<tr><td style="background:#f4f6f3;width:130px;color:#56655d">${k}</td><td><strong>${esc(v)}</strong></td></tr>`).join('\n')}
</table>
${a.message ? `<p style="margin:16px 0 6px;color:#56655d">Lời nhắn:</p><div style="white-space:pre-wrap;padding:12px;background:#fbfaf6;border-left:3px solid #c6a76b">${esc(a.message)}</div>` : ''}
<p style="margin:18px 0">CV đính kèm trong email này. <a href="${adminUrl}" style="color:#0d3128">Mở danh sách ứng viên trong Admin ›</a></p>
<p style="color:#8a978f;font-size:12px">Email tự động từ website Đất Vàng Group. Trả lời email này sẽ gửi tới ứng viên.</p>
</div>`,
        text: [`Hồ sơ ứng tuyển mới`, ...rows.map(([k, v]) => `${k}: ${v}`), '', a.message ?? '', '', `Admin: ${adminUrl}`].join('\n'),
        attachments: a.cvData ? [{ filename: a.cvName ?? 'cv', content: Buffer.from(a.cvData), contentType: a.cvMime ?? 'application/octet-stream' }] : undefined,
      });
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'job application email failed');
    }
  }
}

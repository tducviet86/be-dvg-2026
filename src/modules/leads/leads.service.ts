import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppConfig } from '../../config/config.service.js';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { badRequest, forbidden, notFound } from '../../common/errors.js';
import { assertFresh } from '../../common/utils/content.js';
import { money, toBigInt } from '../../common/utils/serialize.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Lead, Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { CreateLeadDto, InquiryDto, LeadQuery, NewsletterDto, PublicFormDto, UpdateLeadDto } from './leads.dto.js';

/** Submissions faster than this are treated as automated. */
const MIN_FILL_MS = 2500;
type Ctx = { ip?: string; userAgent?: string };

const toDto = (l: Lead & { assignee?: { id: string; name: string } | null; project?: { slug: string; name: string } | null; property?: { slug: string; name: string } | null }) => ({
  id: l.id,
  kind: l.kind,
  source: l.source,
  intent: l.intent,
  name: l.name,
  email: l.email,
  phone: l.phone,
  message: l.message,
  company: l.company,
  position: l.position,
  project: l.project ?? null,
  property: l.property ?? null,
  status: l.status,
  priority: l.priority,
  assignee: l.assignee ?? null,
  notes: l.notes,
  budgetMinVnd: money(l.budgetMinVnd),
  budgetMaxVnd: money(l.budgetMaxVnd),
  preferredLocation: l.preferredLocation,
  preferredContact: l.preferredContact,
  followUpAt: l.followUpAt,
  createdAt: l.createdAt,
  updatedAt: l.updatedAt,
});
const include = {
  assignee: { select: { id: true, name: true } },
  project: { select: { slug: true, name: true } },
  property: { select: { slug: true, name: true } },
} as const;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  private ipHash(ip?: string) {
    return ip ? createHash('sha256').update(`${this.config.get('IP_HASH_SALT')}:${ip}`).digest('hex') : null;
  }

  /** Returns true when the submission looks automated (silently dropped). */
  private isSpam(dto: { website?: string; elapsedMs?: number }) {
    return !!dto.website?.trim() || (dto.elapsedMs !== undefined && dto.elapsedMs < MIN_FILL_MS);
  }

  async submit(kind: 'CONTACT' | 'INQUIRY', dto: PublicFormDto & Partial<InquiryDto>, ctx: Ctx) {
    if (this.isSpam(dto)) {
      this.logger.warn({ kind }, 'spam submission dropped');
      return { id: null };
    }
    const ipHash = this.ipHash(ctx.ip);
    // Same sender, same message within 10 minutes: treat as a duplicate.
    const duplicate = await this.prisma.lead.findFirst({
      where: { email: dto.email.toLowerCase(), message: dto.message, createdAt: { gte: new Date(Date.now() - 600_000) } },
      select: { id: true },
    });
    if (duplicate) return { id: duplicate.id };
    const [project, property] = await Promise.all([
      dto.projectSlug ? this.prisma.project.findFirst({ where: { slug: dto.projectSlug, deletedAt: null }, select: { id: true } }) : null,
      dto.propertySlug ? this.prisma.property.findFirst({ where: { slug: dto.propertySlug, deletedAt: null }, select: { id: true, projectId: true } }) : null,
    ]);
    const lead = await this.prisma.lead.create({
      data: {
        kind,
        source: dto.source || (kind === 'CONTACT' ? 'Liên hệ' : 'Tư vấn'),
        intent: dto.intent,
        name: dto.name,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        message: dto.message,
        projectId: project?.id ?? property?.projectId,
        propertyId: property?.id,
        consentAt: new Date(),
        ipHash,
        userAgent: ctx.userAgent?.slice(0, 300),
      },
    });
    void this.notifyNewLead(lead.id);
    return { id: lead.id };
  }

  /** Recipient: Admin › Cài đặt › "Email tiếp nhận yêu cầu", else LEADS_NOTIFY_EMAIL. */
  private async notifyRecipient() {
    const row = await this.prisma.siteSetting.findUnique({ where: { key: 'leads.notificationEmail' } });
    const fromSettings = typeof row?.value === 'string' ? row.value.trim() : '';
    return fromSettings || this.config.get('LEADS_NOTIFY_EMAIL');
  }

  /**
   * Emails the team about a request from the website (in the background: the
   * visitor never waits and a mail failure never loses the lead).
   */
  private async notifyNewLead(id: string) {
    try {
      const to = await this.notifyRecipient();
      if (!to || !this.mail.enabled) return;
      const lead = await this.prisma.lead.findUnique({
        where: { id },
        include: { project: { select: { name: true } }, property: { select: { name: true, unitCode: true, slug: true } } },
      });
      if (!lead) return;
      const site = this.config.get('SITE_URL').replace(/\/$/, '');
      const adminUrl = `${site}/admin/leads/${lead.id}/edit`;
      const unit = lead.property ? `${lead.property.name}${lead.property.unitCode ? ` (${lead.property.unitCode})` : ''}` : '';
      const rows: [string, string][] = [
        ['Khách hàng', lead.name],
        ['Số điện thoại', lead.phone ?? '—'],
        ['Email', lead.email],
        ['Nhu cầu', lead.intent ?? lead.source],
        ['Dự án', lead.project?.name ?? '—'],
        ['Căn hộ', unit || '—'],
        ['Nguồn', lead.source],
        ['Thời gian', lead.createdAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })],
      ];
      const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2d27;max-width:560px">
<h2 style="color:#0d3128;margin:0 0 12px">Yêu cầu mới từ website</h2>
<table cellpadding="8" style="border-collapse:collapse;width:100%;border:1px solid #e0e4d9">
${rows.map(([k, v]) => `<tr><td style="background:#f4f6f3;width:130px;color:#56655d">${k}</td><td><strong>${esc(v)}</strong></td></tr>`).join('\n')}
</table>
<p style="margin:16px 0 6px;color:#56655d">Nội dung khách gửi:</p>
<div style="white-space:pre-wrap;padding:12px;background:#fbfaf6;border-left:3px solid #c6a76b">${esc(lead.message)}</div>
<p style="margin:18px 0">${lead.phone ? `<a href="tel:${esc(lead.phone)}" style="background:#0d3128;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;margin-right:8px">Gọi ${esc(lead.phone)}</a>` : ''}<a href="${adminUrl}" style="color:#0d3128">Mở trong Admin ›</a></p>
<p style="color:#8a978f;font-size:12px">Email tự động từ website Đất Vàng Group. Trả lời email này sẽ gửi tới khách hàng.</p>
</div>`;
      const text = [
        'Yêu cầu mới từ website',
        ...rows.map(([k, v]) => `${k}: ${v}`),
        '',
        'Nội dung:',
        lead.message,
        '',
        `Mở trong Admin: ${adminUrl}`,
      ].join('\n');
      await this.mail.send({
        to,
        replyTo: lead.email,
        subject: `[Đất Vàng] Yêu cầu mới: ${lead.name}${lead.phone ? ` – ${lead.phone}` : ''}`,
        html,
        text,
      });
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'new lead notification failed');
    }
  }

  async subscribe(dto: NewsletterDto) {
    if (dto.website?.trim()) return;
    const email = dto.email.toLowerCase();
    await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, consentAt: new Date() },
      update: { unsubscribedAt: null },
    });
  }

  /** Sales staff without leads:export only see leads assigned to them or unassigned. */
  private scope(user: AuthUser): Prisma.LeadWhereInput {
    return user.roles.includes('admin') ? {} : { OR: [{ assigneeId: user.id }, { assigneeId: null }] };
  }

  private where(q: LeadQuery, user: AuthUser): Prisma.LeadWhereInput {
    return {
      deletedAt: null,
      status: q.status,
      kind: q.kind,
      assigneeId: q.assigneeId,
      ...(q.from || q.to ? { createdAt: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } } : {}),
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q.toLowerCase() } }, { phone: { contains: q.q.replace(/[\s().-]/g, '') } }, { company: { contains: q.q, mode: 'insensitive' } }] }
        : {}),
      AND: [this.scope(user)],
    };
  }

  async list(q: LeadQuery, user: AuthUser) {
    const where = this.where(q, user);
    const [rows, total, counts] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include,
        orderBy: q.sort === 'updated' ? [{ updatedAt: 'desc' }, { id: 'asc' }] : q.sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.lead.count({ where }),
      this.prisma.lead.groupBy({ by: ['status'], where: { deletedAt: null, AND: [this.scope(user)] }, _count: { _all: true }, orderBy: { status: 'asc' } }),
    ]);
    return {
      data: rows.map(toDto),
      meta: { ...pageMeta(q.page, q.pageSize, total), byStatus: Object.fromEntries(counts.map((c) => [c.status, (c._count as { _all: number })._all])) },
    };
  }

  async get(id: string, user: AuthUser) {
    const lead = await this.prisma.lead.findFirst({ where: { id, deletedAt: null, AND: [this.scope(user)] }, include });
    if (!lead) throw notFound('Không tìm thấy yêu cầu.');
    return toDto(lead);
  }

  async update(id: string, dto: UpdateLeadDto, user: AuthUser) {
    const existing = await this.prisma.lead.findFirst({ where: { id, deletedAt: null, AND: [this.scope(user)] } });
    if (!existing) throw notFound('Không tìm thấy yêu cầu.');
    assertFresh(existing.updatedAt, dto.expectedUpdatedAt);
    if (dto.assigneeId && !(await this.prisma.user.findFirst({ where: { id: dto.assigneeId, status: 'ACTIVE' } })))
      throw badRequest('Người phụ trách không hợp lệ.');
    if (dto.assigneeId !== undefined && dto.assigneeId !== user.id && !user.roles.includes('admin') && dto.assigneeId !== null)
      throw forbidden('Chỉ quản trị viên được phân công cho người khác.');
    const min = dto.budgetMinVnd === undefined ? existing.budgetMinVnd : toBigInt(dto.budgetMinVnd);
    const max = dto.budgetMaxVnd === undefined ? existing.budgetMaxVnd : toBigInt(dto.budgetMaxVnd);
    if (min !== null && max !== null && min > max) throw badRequest('Ngân sách tối đa phải lớn hơn hoặc bằng ngân sách tối thiểu.');
    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        status: dto.status,
        priority: dto.priority,
        assigneeId: dto.assigneeId,
        notes: dto.notes,
        followUpAt: dto.followUpAt === undefined ? undefined : dto.followUpAt ? new Date(dto.followUpAt) : null,
        company: dto.company,
        position: dto.position,
        budgetMinVnd: dto.budgetMinVnd === undefined ? undefined : min,
        budgetMaxVnd: dto.budgetMaxVnd === undefined ? undefined : max,
        preferredLocation: dto.preferredLocation,
        preferredContact: dto.preferredContact,
      },
      include,
    });
    await this.audit.log({ actorId: user.id, action: 'lead.update', entityType: 'lead', entityId: id, changes: JSON.parse(JSON.stringify({ ...dto, notes: dto.notes === undefined ? undefined : '[updated]' })) });
    return toDto(lead);
  }

  async createManual(dto: CreateLeadDto, user: AuthUser) {
    const lead = await this.prisma.lead.create({
      data: { kind: dto.kind, source: dto.source, intent: dto.intent, name: dto.name, email: dto.email.toLowerCase(), phone: dto.phone?.replace(/[\s().-]/g, '') || null, message: dto.message, consentAt: new Date(), assigneeId: user.roles.includes('admin') ? null : user.id },
      include,
    });
    await this.audit.log({ actorId: user.id, action: 'lead.create', entityType: 'lead', entityId: lead.id });
    return toDto(lead);
  }

  async remove(id: string, user: AuthUser) {
    const existing = await this.prisma.lead.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound('Không tìm thấy yêu cầu.');
    await this.prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ actorId: user.id, action: 'lead.delete', entityType: 'lead', entityId: id });
  }

  /** CSV export (UTF-8 BOM for Excel); formula injection neutralised. */
  async exportCsv(q: LeadQuery, user: AuthUser) {
    const rows = await this.prisma.lead.findMany({ where: this.where(q, user), include, orderBy: { createdAt: 'desc' }, take: 10_000 });
    const cell = (value: unknown) => {
      let text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const header = ['Ngày tạo', 'Loại', 'Nguồn', 'Nhu cầu', 'Họ tên', 'Email', 'Điện thoại', 'Nội dung', 'Dự án', 'Căn hộ', 'Trạng thái', 'Phụ trách', 'Ghi chú'];
    const lines = rows.map((l) =>
      [l.createdAt, l.kind, l.source, l.intent, l.name, l.email, l.phone, l.message, l.project?.name, l.property?.name, l.status, l.assignee?.name, l.notes].map(cell).join(','),
    );
    await this.audit.log({ actorId: user.id, action: 'lead.export', entityType: 'lead', changes: { count: rows.length, filters: JSON.parse(JSON.stringify(q)) } });
    if (rows.length === 10_000) this.logger.warn('lead export truncated at 10000 rows');
    return '﻿' + [header.map(cell).join(','), ...lines].join('\r\n');
  }
}

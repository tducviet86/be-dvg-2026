import { Body, Controller, Get, HttpCode, HttpStatus, Injectable, Logger, Module, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { createSign } from 'node:crypto';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import { Clean } from '../../common/dto/fields.js';
import { AppError, badRequest, notFound } from '../../common/errors.js';
import { AppConfig } from '../../config/config.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AiModule } from '../ai/ai.controller.js';
import { AiService } from '../ai/ai.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';
import { landingPages } from '../settings/settings.controller.js';

export type KeywordRow = { query: string; page: string; clicks: number; impressions: number; ctr: number; position: number };
const DAY = 86_400_000;
const CACHE_MS = 6 * 3600_000;

/**
 * Google Search Console, read-only, with a service account: what people
 * searched for, which page Google showed and where. Results are kept for a
 * few hours (Google updates them about once a day).
 */
@Injectable()
export class SearchConsoleService {
  private readonly logger = new Logger(SearchConsoleService.name);
  private token: { value: string; until: number } | null = null;
  private cache = new Map<number, { at: number; rows: KeywordRow[] }>();

  constructor(private readonly config: AppConfig) {}

  get site() {
    return this.config.get('GSC_SITE').trim();
  }
  get enabled() {
    return !!(this.site && this.config.get('GSC_CLIENT_EMAIL') && this.config.get('GSC_PRIVATE_KEY'));
  }

  private fail(message: string) {
    return new AppError(HttpStatus.BAD_GATEWAY, 'SEARCH_CONSOLE_UNAVAILABLE', message);
  }

  /** An access token for the service account (signed JWT, OAuth 2.0). */
  private async accessToken() {
    if (this.token && this.token.until > Date.now() + 60_000) return this.token.value;
    const tokenUrl = this.config.get('GSC_TOKEN_URL');
    const now = Math.floor(Date.now() / 1000);
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
      iss: this.config.get('GSC_CLIENT_EMAIL'),
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: tokenUrl,
      iat: now,
      exp: now + 3600,
    })}`;
    let signature: string;
    try {
      signature = createSign('RSA-SHA256').update(unsigned).sign(this.config.get('GSC_PRIVATE_KEY').replace(/\\n/g, '\n'), 'base64url');
    } catch {
      throw this.fail('Khoá riêng của tài khoản dịch vụ (GSC_PRIVATE_KEY) không đọc được.');
    }
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
    if (!res?.ok || !body?.access_token) throw this.fail('Google không cấp quyền cho tài khoản dịch vụ. Kiểm tra GSC_CLIENT_EMAIL và GSC_PRIVATE_KEY.');
    this.token = { value: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  /** Searches of the last `days` days (to yesterday), by search and page. */
  async keywords(days: number): Promise<{ rows: KeywordRow[]; from: string; to: string; fetchedAt: string }> {
    const to = new Date(Date.now() - DAY).toISOString().slice(0, 10);
    const from = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
    const kept = this.cache.get(days);
    if (kept && Date.now() - kept.at < CACHE_MS) return { rows: kept.rows, from, to, fetchedAt: new Date(kept.at).toISOString() };
    const token = await this.accessToken();
    const res = await fetch(`${this.config.get('GSC_API_BASE')}/webmasters/v3/sites/${encodeURIComponent(this.site)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ startDate: from, endDate: to, dimensions: ['query', 'page'], rowLimit: 1000, dataState: 'all' }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (res?.status === 403)
      throw this.fail(`Tài khoản dịch vụ chưa được thêm vào thuộc tính "${this.site}" trong Search Console (Cài đặt › Người dùng và quyền).`);
    const body = (await res?.json().catch(() => null)) as { rows?: { keys: [string, string]; clicks: number; impressions: number; ctr: number; position: number }[] } | null;
    if (!res?.ok || !body) {
      this.logger.warn({ status: res?.status }, 'search console query failed');
      throw this.fail('Chưa lấy được dữ liệu từ Search Console. Thử lại sau ít phút.');
    }
    const rows = (body.rows ?? []).map((r) => ({
      query: r.keys[0],
      page: r.keys[1],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: Math.round(r.position * 10) / 10,
    }));
    const at = Date.now();
    this.cache.set(days, { at, rows });
    return { rows, from, to, fetchedAt: new Date(at).toISOString() };
  }
}

/** A page of the site, from a URL Search Console reports. */
export type Target =
  | { kind: 'property' | 'project'; id: string; title: string; seoTitle: string | null; seoDescription: string | null; text: string }
  | { kind: 'landing'; purpose: 'rent' | 'sale'; slug: string; title: string; seoTitle: string | null; seoDescription: string | null; text: string };

class KeywordsQuery {
  @IsOptional() @Type(() => Number) @IsIn([7, 28, 90]) days: 7 | 28 | 90 = 28;
}
class SuggestDto {
  @Clean() @IsString() @MinLength(2) @MaxLength(200) query: string;
  @IsString() @MaxLength(500) page: string;
}
class ApplyDto {
  @IsIn(['property', 'project', 'landing']) kind: 'property' | 'project' | 'landing';
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsIn(['rent', 'sale']) purpose?: 'rent' | 'sale';
  @IsOptional() @IsString() @MaxLength(80) slug?: string;
  @Clean() @IsString() @MinLength(10) @MaxLength(70) seoTitle: string;
  @Clean() @IsString() @MinLength(30) @MaxLength(320) seoDescription: string;
}

/**
 * Admin › Từ khoá & SEO (administrators only): the searches that show the
 * site, an AI proposal of title and description for the page a search lands
 * on, and applying it.
 */
@ApiTags('admin/seo')
@Controller('admin/seo')
export class SearchConsoleController {
  constructor(
    private readonly gsc: SearchConsoleService,
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  @Get('keywords')
  @RequirePermissions(PERMISSIONS.settingsWrite)
  async keywords(@Query() q: KeywordsQuery) {
    if (!this.gsc.enabled) return { data: { configured: false, site: null, rows: [] } };
    const result = await this.gsc.keywords(q.days);
    return { data: { configured: true, site: this.gsc.site, days: q.days, ...result } };
  }

  /** The page a URL shows, with what an AI proposal needs and can change. */
  private async target(page: string): Promise<Target> {
    let path: string;
    try {
      path = new URL(page, 'https://x.invalid').pathname;
    } catch {
      throw badRequest('Đường dẫn trang không hợp lệ.');
    }
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (['en', 'ko', 'zh'].includes(parts[0])) parts.shift();
    const [a, b, c] = parts;
    if ((a === 'cho-thue' || a === 'mua-ban') && b === 'nhu-cau' && c) {
      const row = await this.prisma.siteSetting.findUnique({ where: { key: 'seo.landings' } });
      const purpose = a === 'mua-ban' ? 'sale' : 'rent';
      const list = row?.value ? landingPages(String(row.value)) : [];
      const l = list.find((x) => x.slug === c && x.purpose === purpose);
      if (!l) throw notFound('Không tìm thấy trang theo nhu cầu này.');
      return { kind: 'landing', purpose, slug: l.slug, title: l.h1, seoTitle: l.seoTitle || null, seoDescription: l.seoDescription || null, text: l.intro };
    }
    const projectSlug = a === 'du-an' && b && !c ? b : a === 'cho-thue' && b === 'du-an' && c ? c : null;
    if (projectSlug) {
      const p = await this.prisma.project.findFirst({ where: { slug: projectSlug, deletedAt: null }, select: { id: true, name: true, seoTitle: true, seoDescription: true, intro: true, location: true } });
      if (!p) throw notFound('Không tìm thấy dự án của trang này.');
      return { kind: 'project', id: p.id, title: p.name, seoTitle: p.seoTitle, seoDescription: p.seoDescription, text: `${p.location}\n${p.intro}` };
    }
    if ((a === 'cho-thue' || a === 'mua-ban') && b && !c) {
      const u = await this.prisma.property.findFirst({ where: { slug: b, deletedAt: null }, select: { id: true, name: true, seoTitle: true, seoDescription: true, description: true, location: true } });
      if (!u) throw notFound('Không tìm thấy căn hộ của trang này.');
      return { kind: 'property', id: u.id, title: u.name, seoTitle: u.seoTitle, seoDescription: u.seoDescription, text: `${u.location}\n${u.description}` };
    }
    throw badRequest('Trang này chưa hỗ trợ gợi ý tự động (chỉ trang căn hộ, dự án và trang theo nhu cầu).');
  }

  /** Proposes a title and description that answer the search. Nothing is saved. */
  @Post('keywords/suggest')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions(PERMISSIONS.settingsWrite)
  async suggest(@Body() dto: SuggestDto, @CurrentUser() user: AuthUser) {
    const target = await this.target(dto.page);
    const suggestion = await this.ai.suggestSeo({
      kind: target.kind === 'landing' ? 'page' : target.kind,
      title: target.title,
      summary: target.seoDescription ?? undefined,
      content: target.text.slice(0, 8000),
      context: `Khách đang tìm trên Google cụm từ: "${dto.query}". Đưa đúng cụm từ này (hoặc sát nghĩa, tự nhiên) vào tiêu đề SEO và mô tả SEO để trang được chọn cho cụm từ đó.`,
    });
    await this.audit.log({ actorId: user.id, action: 'ai.keyword_suggest', entityType: target.kind, changes: { query: dto.query, page: dto.page } });
    const { text: _text, ...page } = target;
    return { data: { target: page, suggestion: { seoTitle: suggestion.seoTitle, seoDescription: suggestion.seoDescription } } };
  }

  /** Writes the accepted title and description to the page. */
  @Post('keywords/apply')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.settingsWrite)
  async apply(@Body() dto: ApplyDto, @CurrentUser() user: AuthUser) {
    const seo = { seoTitle: dto.seoTitle, seoDescription: dto.seoDescription };
    if (dto.kind === 'landing') {
      const row = await this.prisma.siteSetting.findUnique({ where: { key: 'seo.landings' } });
      const list = row?.value ? landingPages(String(row.value)) : [];
      const i = list.findIndex((x) => x.slug === dto.slug && x.purpose === dto.purpose);
      if (i < 0) throw notFound('Không tìm thấy trang theo nhu cầu này.');
      list[i] = { ...list[i], ...seo };
      await this.prisma.siteSetting.update({ where: { key: 'seo.landings' }, data: { value: JSON.stringify(list) } });
      await this.revalidation.trigger('settings');
    } else {
      if (!dto.id) throw badRequest('Thiếu mã trang.');
      const where = { id: dto.id, deletedAt: null };
      const found =
        dto.kind === 'project'
          ? await this.prisma.project.updateMany({ where, data: seo })
          : await this.prisma.property.updateMany({ where, data: seo });
      if (!found.count) throw notFound();
      await this.revalidation.trigger('projects', 'properties');
    }
    await this.audit.log({ actorId: user.id, action: 'seo.keyword_apply', entityType: dto.kind, entityId: dto.id, changes: seo });
    return { data: { ok: true } };
  }
}

@Module({ imports: [AiModule], controllers: [SearchConsoleController], providers: [SearchConsoleService] })
export class SearchConsoleModule {}

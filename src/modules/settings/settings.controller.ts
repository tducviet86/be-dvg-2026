import { Body, Controller, Get, Module, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import { badRequest } from '../../common/errors.js';
import { cleanStrings } from '../../common/utils/text.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';

/** Known keys and whether they may be exposed on the public website. */
export const SETTING_KEYS: Record<string, { public: boolean; max: number }> = {
  'company.brand': { public: true, max: 120 },
  'company.legalName': { public: true, max: 200 },
  'company.taxCode': { public: true, max: 40 },
  'company.representative': { public: false, max: 120 },
  'company.tagline': { public: true, max: 200 },
  'company.hotline': { public: true, max: 40 },
  'company.email': { public: true, max: 120 },
  'company.address': { public: true, max: 300 },
  'company.workingHours': { public: true, max: 120 },
  'company.website': { public: true, max: 300 },
  'social.facebook': { public: true, max: 300 },
  'social.zalo': { public: true, max: 300 },
  'social.youtube': { public: true, max: 300 },
  // Google reviews: the profile's review page, its "write a review" link,
  // and the overall rating / count shown there (copied by staff).
  'reviews.googleUrl': { public: true, max: 500 },
  'reviews.googleWriteUrl': { public: true, max: 500 },
  'reviews.googleRating': { public: true, max: 4 },
  'reviews.googleCount': { public: true, max: 6 },
  'seo.defaultTitle': { public: true, max: 120 },
  'seo.defaultDescription': { public: true, max: 320 },
  'leads.notificationEmail': { public: false, max: 120 },
  // Measurement IDs (not secrets): GA4 "G-…", Google Ads "AW-…" with the
  // lead conversion "AW-…/label", Meta Pixel digits.
  'tracking.ga4': { public: true, max: 40 },
  'tracking.googleAds': { public: true, max: 40 },
  'tracking.googleAdsLead': { public: true, max: 80 },
  'tracking.metaPixel': { public: true, max: 40 },
  // Search landing pages ("Cho thuê căn hộ 2PN Đà Nẵng"): a JSON list edited
  // in Admin › Từ khoá & SEO, checked by landingPages() below.
  'seo.landings': { public: true, max: 60_000 },
};

/** Filters a landing page may fix, as the public search URL names them. */
const LANDING_FILTERS = ['project', 'loai', 'bedrooms', 'price', 'gia-tu', 'gia-ban', 'gia-ban-tu', 'area', 'furniture', 'location'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The landing pages as stored: a JSON array of { slug, purpose, h1,
 * seoTitle, seoDescription, intro, filters, published }. Anything else is
 * refused, so the public site can trust what it reads.
 */
export function landingPages(text: string) {
  let list: unknown;
  try {
    list = JSON.parse(text);
  } catch {
    throw badRequest('Danh sách trang theo nhu cầu không đúng định dạng.');
  }
  if (!Array.isArray(list) || list.length > 60) throw badRequest('Tối đa 60 trang theo nhu cầu.');
  const str = (v: unknown, max: number, min = 0) =>
    typeof v === 'string' && v.trim().length >= min && v.length <= max ? v.trim() : null;
  const seen = new Set<string>();
  return list.map((raw, i) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const slug = str(item.slug, 80, 3);
    const h1 = str(item.h1, 120, 5);
    const seoTitle = str(item.seoTitle ?? '', 70);
    const seoDescription = str(item.seoDescription ?? '', 320);
    const intro = str(item.intro ?? '', 3000);
    const purpose = item.purpose === 'sale' ? 'sale' : item.purpose === 'rent' ? 'rent' : null;
    const filters = item.filters && typeof item.filters === 'object' && !Array.isArray(item.filters) ? (item.filters as Record<string, unknown>) : null;
    const where = `Trang ${i + 1}`;
    if (!slug || !SLUG.test(slug)) throw badRequest(`${where}: đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang.`);
    if (seen.has(`${purpose}/${slug}`)) throw badRequest(`${where}: đường dẫn "${slug}" bị trùng.`);
    seen.add(`${purpose}/${slug}`);
    if (!purpose) throw badRequest(`${where}: chọn Cho thuê hoặc Mua bán.`);
    if (!h1) throw badRequest(`${where}: tiêu đề trang cần 5–120 ký tự.`);
    if (seoTitle === null || seoDescription === null || intro === null) throw badRequest(`${where}: tiêu đề SEO, mô tả hoặc đoạn giới thiệu quá dài.`);
    if (!filters) throw badRequest(`${where}: thiếu bộ lọc.`);
    const kept: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (!LANDING_FILTERS.includes(key)) throw badRequest(`${where}: bộ lọc "${key}" không dùng được.`);
      const v = str(value, 80);
      if (v) kept[key] = v;
    }
    return { slug, purpose, h1, seoTitle, seoDescription, intro, filters: kept, published: item.published === true };
  });
}

class SettingsDto {
  @IsObject() values: Record<string, string | null>;
}

@ApiTags('settings')
@Controller()
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  @Public()
  @Get('settings/public')
  async publicSettings() {
    const rows = await this.prisma.siteSetting.findMany({ where: { isPublic: true } });
    return { data: Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  }

  @Get('admin/settings')
  @RequirePermissions(PERMISSIONS.settingsWrite)
  async list() {
    const rows = await this.prisma.siteSetting.findMany();
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { data: Object.keys(SETTING_KEYS).map((key) => ({ key, isPublic: SETTING_KEYS[key].public, value: stored[key] ?? null })) };
  }

  @Put('admin/settings')
  @RequirePermissions(PERMISSIONS.settingsWrite)
  async save(@Body() dto: SettingsDto, @CurrentUser() user: AuthUser) {
    const values = cleanStrings(dto.values);
    for (const [key, value] of Object.entries(values)) {
      const spec = SETTING_KEYS[key];
      if (!spec) throw badRequest(`Khóa cài đặt không hợp lệ: ${key}`);
      if (value !== null && (typeof value !== 'string' || value.length > spec.max)) throw badRequest(`Giá trị không hợp lệ: ${key}`);
      if (key === 'seo.landings' && value) values[key] = JSON.stringify(landingPages(value));
    }
    await this.prisma.$transaction(
      Object.entries(values).map(([key, value]) =>
        value === null || value === ''
          ? this.prisma.siteSetting.deleteMany({ where: { key } })
          : this.prisma.siteSetting.upsert({
              where: { key },
              create: { key, value: value as Prisma.InputJsonValue, isPublic: SETTING_KEYS[key].public },
              update: { value: value as Prisma.InputJsonValue, isPublic: SETTING_KEYS[key].public },
            }),
      ),
    );
    await this.audit.log({ actorId: user.id, action: 'settings.update', entityType: 'settings', changes: { keys: Object.keys(values) } });
    await this.revalidation.trigger('settings');
    return this.list();
  }
}

@Module({ controllers: [SettingsController] })
export class SettingsModule {}

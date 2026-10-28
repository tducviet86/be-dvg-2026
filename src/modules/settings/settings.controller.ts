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
  'seo.defaultTitle': { public: true, max: 120 },
  'seo.defaultDescription': { public: true, max: 320 },
  'leads.notificationEmail': { public: false, max: 120 },
  // Measurement IDs (not secrets): GA4 "G-…", Google Ads "AW-…" with the
  // lead conversion "AW-…/label", Meta Pixel digits.
  'tracking.ga4': { public: true, max: 40 },
  'tracking.googleAds': { public: true, max: 40 },
  'tracking.googleAdsLead': { public: true, max: 80 },
  'tracking.metaPixel': { public: true, max: 40 },
};

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

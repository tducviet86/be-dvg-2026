import { timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, Global, Headers, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import { PaginationQuery, pageMeta } from '../../common/dto/pagination.dto.js';
import { AppError, badRequest } from '../../common/errors.js';
import { AppConfig } from '../../config/config.service.js';
import { AiModule } from '../ai/ai.controller.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { I18nService, LOCALES, type Locale } from './i18n.service.js';

class LocaleQuery {
  @IsIn(LOCALES) locale: Locale;
}
class TranslateDto {
  @IsIn(LOCALES) locale: Locale;
  @IsArray() @ArrayMaxSize(300) @IsString({ each: true }) @MaxLength(2000, { each: true }) texts: string[];
}
class TranslationQuery extends PaginationQuery {
  @IsOptional() @IsIn(LOCALES) locale?: Locale;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value)) @IsBoolean() reviewed?: boolean;
}
class CorrectTranslationDto {
  @IsString() @MinLength(1) @MaxLength(4000) text: string;
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
}

@ApiTags('i18n')
@Controller()
export class I18nController {
  constructor(
    private readonly i18n: I18nService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Get('i18n/status')
  status() {
    return { data: { enabled: this.i18n.enabled, locales: ['vi', ...LOCALES] } };
  }

  /** All translations of a language; the website loads it to render /en, /ko, /zh. */
  @Public()
  @Get('i18n/dictionary')
  async dictionary(@Query() q: LocaleQuery) {
    return { data: { locale: q.locale, ...(await this.i18n.dictionary(q.locale)) } };
  }

  /**
   * Translates strings the website met while rendering. Server-to-server
   * only (same shared secret as the revalidation webhook), so visitors cannot
   * spend the Gemini quota.
   */
  @Public()
  @Post('i18n/translate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async translate(@Body() dto: TranslateDto, @Headers('x-revalidate-secret') secret?: string) {
    const expected = this.config.get('REVALIDATE_SECRET');
    const ok =
      !!expected &&
      !!secret &&
      secret.length === expected.length &&
      timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
    if (!ok) throw new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Thiếu hoặc sai khóa máy chủ.');
    if (dto.texts.reduce((n, t) => n + t.length, 0) > 60_000) throw badRequest('Quá nhiều nội dung trong một lần dịch.');
    return { data: { locale: dto.locale, translations: await this.i18n.translate(dto.locale, dto.texts) } };
  }

  @Get('admin/translations')
  @RequirePermissions(PERMISSIONS.contentRead)
  async list(@Query() q: TranslationQuery) {
    const { rows, total } = await this.i18n.list(q);
    return {
      data: rows,
      meta: pageMeta(q.page, q.pageSize, total),
    };
  }

  /** Editors correct a translation; it is marked reviewed and kept forever. */
  @Patch('admin/translations/:id')
  @RequirePermissions(PERMISSIONS.pagesWrite)
  async correct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CorrectTranslationDto, @CurrentUser() user: AuthUser) {
    const row = await this.i18n.correct(id, dto.text, dto.expectedUpdatedAt);
    await this.audit.log({
      actorId: user.id,
      action: 'translation.correct',
      entityType: 'translation',
      entityId: id,
      changes: { locale: row.locale, text: row.text.slice(0, 200) },
    });
    return { data: row };
  }
}

@Global()
@Module({ imports: [AiModule], controllers: [I18nController], providers: [I18nService], exports: [I18nService] })
export class I18nModule {}

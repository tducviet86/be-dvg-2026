import { Body, Controller, Get, HttpCode, HttpStatus, Module, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import { Clean } from '../../common/dto/fields.js';
import { forbidden } from '../../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { AiService, SEO_LIMITS, type SeoKind } from './ai.service.js';

class SeoSuggestDto {
  @IsIn(['post', 'project', 'property', 'page', 'job']) kind: SeoKind;
  @Clean() @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsOptional() @Clean() @IsString() @MaxLength(2000) summary?: string;
  @IsOptional() @Clean() @IsString() @MaxLength(50000) content?: string;
  @IsOptional() @Clean() @IsString() @MaxLength(1000) context?: string;
}

const WRITE: Record<SeoKind, string> = {
  post: PERMISSIONS.blogWrite,
  project: PERMISSIONS.projectsWrite,
  property: PERMISSIONS.propertiesWrite,
  page: PERMISSIONS.pagesWrite,
  job: PERMISSIONS.pagesWrite,
};

@ApiTags('admin/ai')
@Controller('admin/ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly audit: AuditService,
  ) {}

  @Get('status')
  @RequirePermissions(PERMISSIONS.contentRead)
  status() {
    return { data: { seo: this.ai.enabled, model: this.ai.enabled ? this.ai.model : null, limits: SEO_LIMITS } };
  }

  /** Suggests SEO tags from the editor's current text. Nothing is saved. */
  @Post('seo-suggest')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions(PERMISSIONS.contentRead)
  async seoSuggest(@Body() dto: SeoSuggestDto, @CurrentUser() user: AuthUser) {
    if (!user.permissions.includes(WRITE[dto.kind])) throw forbidden();
    const suggestion = await this.ai.suggestSeo(dto);
    await this.audit.log({
      actorId: user.id,
      action: 'ai.seo_suggest',
      entityType: dto.kind,
      changes: { model: this.ai.model, title: dto.title.slice(0, 120), chars: (dto.content ?? '').length },
    });
    return { data: suggestion };
  }
}

@Module({ controllers: [AiController], providers: [AiService], exports: [AiService] })
export class AiModule {}

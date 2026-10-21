import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import { Clean } from '../../common/dto/fields.js';
import { forbidden, notFound } from '../../common/errors.js';
import { assertFresh, publishedWhere, publishFields } from '../../common/utils/content.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PublishStatus } from '../../generated/prisma/enums.js';
import type { StaticPage } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';

class SectionDto {
  @Clean() @IsString() @MinLength(1) @MaxLength(200) heading: string;
  @Clean() @IsString() @MinLength(1) @MaxLength(6000) body: string;
}
class PageDto {
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/) @MaxLength(200) path: string;
  @Clean() @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsOptional() @Clean() @IsString() @MaxLength(120) eyebrow?: string | null;
  @Clean() @IsString() @MinLength(10) @MaxLength(2000) intro: string;
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => SectionDto) sections: SectionDto[];
  @IsOptional() @IsEnum(PublishStatus) status?: PublishStatus;
  @IsOptional() @Clean() @IsString() @MaxLength(120) seoTitle?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(320) seoDescription?: string | null;
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
}

const toDto = (p: StaticPage) => ({
  id: p.id,
  path: p.path,
  title: p.title,
  eyebrow: p.eyebrow,
  intro: p.intro,
  sections: p.sections as { heading: string; body: string }[],
  seo: { title: p.seoTitle, description: p.seoDescription },
  updatedAt: p.updatedAt,
});

@ApiTags('pages')
@Controller()
export class PagesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  @Public()
  @Get('pages/*path')
  async get(@Param('path') path: string | string[]) {
    const key = Array.isArray(path) ? path.join('/') : path;
    const { deletedAt: _d, ...live } = publishedWhere();
    const page = await this.prisma.staticPage.findFirst({ where: { path: key, ...live } });
    if (!page) throw notFound('Không tìm thấy trang.');
    return { data: toDto(page) };
  }

  @Get('admin/pages')
  @RequirePermissions(PERMISSIONS.contentRead)
  async list() {
    const rows = await this.prisma.staticPage.findMany({ orderBy: { path: 'asc' } });
    return { data: rows.map((p) => ({ ...toDto(p), status: p.status })) };
  }

  @Post('admin/pages')
  @RequirePermissions(PERMISSIONS.pagesWrite)
  async create(@Body() dto: PageDto, @CurrentUser() user: AuthUser) {
    if (dto.status === 'PUBLISHED' && !user.permissions.includes(PERMISSIONS.publish)) throw forbidden();
    const { expectedUpdatedAt: _e, status, ...data } = dto;
    const page = await this.prisma.staticPage.create({ data: { ...data, sections: data.sections.map((s) => ({ ...s })), ...publishFields(status ?? 'DRAFT') } });
    await this.audit.log({ actorId: user.id, action: 'page.create', entityType: 'page', entityId: page.id, changes: { path: page.path } });
    await this.revalidation.trigger('pages');
    return { data: { ...toDto(page), status: page.status } };
  }

  @Patch('admin/pages/:id')
  @RequirePermissions(PERMISSIONS.pagesWrite)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PageDto, @CurrentUser() user: AuthUser) {
    const existing = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!existing) throw notFound('Không tìm thấy trang.');
    assertFresh(existing.updatedAt, dto.expectedUpdatedAt);
    if (dto.status && dto.status !== existing.status && !user.permissions.includes(PERMISSIONS.publish)) throw forbidden();
    const { expectedUpdatedAt: _e, status, ...data } = dto;
    const page = await this.prisma.staticPage.update({ where: { id }, data: { ...data, sections: data.sections.map((s) => ({ ...s })), ...publishFields(status, existing) } });
    await this.audit.log({ actorId: user.id, action: 'page.update', entityType: 'page', entityId: id, changes: { path: page.path, status: page.status } });
    await this.revalidation.trigger('pages');
    return { data: { ...toDto(page), status: page.status } };
  }
}

@Module({ controllers: [PagesController] })
export class PagesModule {}

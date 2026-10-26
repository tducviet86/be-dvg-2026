import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import { Clean } from '../../common/dto/fields.js';
import { pageMeta, PaginationQuery } from '../../common/dto/pagination.dto.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { assertFresh, image, publishedWhere, publishFields } from '../../common/utils/content.js';
import { normalize } from '../../common/utils/text.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PageKind, PublishStatus } from '../../generated/prisma/enums.js';
import type { MediaAsset, Prisma, StaticPage } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { I18nService } from '../i18n/i18n.service.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';

const PATH = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
/** First URL segments that belong to built-in website pages. */
const RESERVED = new Set(['admin', 'api', 'media', 'cho-thue', 'du-an', 'blog', 'dich-vu', 'en', 'ko', 'zh', 'vi']);

class SectionDto {
  @Clean() @IsString() @MinLength(1) @MaxLength(200) heading: string;
  @Clean() @IsString() @MinLength(1) @MaxLength(6000) body: string;
}
class PageDto {
  @IsString() @Matches(PATH, { message: 'Đường dẫn chỉ gồm chữ thường không dấu, số, "-" và "/".' }) @MaxLength(200) path: string;
  @IsOptional() @IsEnum(PageKind) kind?: PageKind;
  @Clean() @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsOptional() @Clean() @IsString() @MaxLength(120) eyebrow?: string | null;
  @Clean() @IsString() @MinLength(10) @MaxLength(2000) intro: string;
  @IsOptional() @Clean() @IsString() @MaxLength(160) summary?: string | null;
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => SectionDto) sections: SectionDto[];
  @IsOptional() @IsUUID() coverImageId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) sortOrder?: number;
  @IsOptional() @IsBoolean() inMenu?: boolean;
  @IsOptional() @Matches(/^\/[a-z0-9/-]*$/, { message: 'Link cần bắt đầu bằng "/" (trang trong website), vd /hop-tac-chu-so-huu.' }) @MaxLength(200) linkHref?: string | null;
  @IsOptional() @IsEnum(PublishStatus) status?: PublishStatus;
  @IsOptional() @Clean() @IsString() @MaxLength(120) seoTitle?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(320) seoDescription?: string | null;
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
}
class PageQuery extends PaginationQuery {
  @IsOptional() @IsEnum(PageKind) kind?: PageKind;
  @IsOptional() @IsEnum(PublishStatus) status?: PublishStatus;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

/** Shown on the "Đường dẫn" field in Admin (same shape as validation errors). */
const pathError = (message: string) => [{ field: 'path', constraints: ['path'], messages: [message] }];

type Row = StaticPage & { coverImage: MediaAsset | null };
const include = { coverImage: true } as const;

const toDto = (p: Row) => ({
  id: p.id,
  path: p.path,
  kind: p.kind,
  title: p.title,
  eyebrow: p.eyebrow,
  intro: p.intro,
  summary: p.summary,
  sections: p.sections as { heading: string; body: string }[],
  coverImage: image(p.coverImage, p.title),
  sortOrder: p.sortOrder,
  inMenu: p.inMenu,
  linkHref: p.linkHref,
  seo: { title: p.seoTitle, description: p.seoDescription },
  publishedAt: p.publishedAt,
  updatedAt: p.updatedAt,
});
const toAdmin = (p: Row) => ({
  ...toDto(p),
  status: p.status,
  coverImageId: p.coverImageId,
  seoTitle: p.seoTitle,
  seoDescription: p.seoDescription,
  createdAt: p.createdAt,
});
/** Pages are never deleted from the public site with deletedAt; ARCHIVED hides them. */
const live = () => {
  const { deletedAt: _d, ...where } = publishedWhere();
  return where;
};

@ApiTags('pages')
@Controller()
export class PagesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
    private readonly i18n: I18nService,
  ) {}

  @Public()
  @Get('pages/*path')
  async get(@Param('path') path: string | string[]) {
    const key = Array.isArray(path) ? path.join('/') : path;
    const page = await this.prisma.staticPage.findFirst({ where: { path: key, ...live() }, include });
    if (!page) throw notFound('Không tìm thấy trang.');
    return { data: toDto(page) };
  }

  /** "Lĩnh vực hoạt động" in display order (cards, header menu, sitemap). */
  @Public()
  @Get('services')
  async services() {
    const rows = await this.prisma.staticPage.findMany({
      where: { kind: 'SERVICE', ...live() },
      include,
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
    return { data: rows.map(toDto) };
  }

  @Get('admin/pages')
  @RequirePermissions(PERMISSIONS.contentRead)
  async list(@Query() q: PageQuery) {
    const words = q.q ? normalize(q.q).split(/[^a-z0-9]+/).filter(Boolean) : [];
    const where: Prisma.StaticPageWhereInput = {
      kind: q.kind,
      status: q.status,
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { path: { contains: words.join('-') || q.q } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.staticPage.findMany({
        where,
        include,
        orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { path: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.staticPage.count({ where }),
    ]);
    return { data: rows.map(toAdmin), meta: pageMeta(q.page, q.pageSize, total) };
  }

  @Get('admin/pages/:id')
  @RequirePermissions(PERMISSIONS.contentRead)
  async adminGet(@Param('id', ParseUUIDPipe) id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id }, include });
    if (!page) throw notFound('Không tìm thấy trang.');
    return { data: toAdmin(page) };
  }

  @Post('admin/pages')
  @RequirePermissions(PERMISSIONS.pagesWrite)
  async create(@Body() dto: PageDto, @CurrentUser() user: AuthUser) {
    if (dto.status === 'PUBLISHED' && !user.permissions.includes(PERMISSIONS.publish)) throw forbidden();
    const data = await this.prepare(dto);
    const page = await this.prisma.staticPage.create({ data: { ...data, ...publishFields(dto.status ?? 'DRAFT') }, include });
    await this.audit.log({ actorId: user.id, action: 'page.create', entityType: 'page', entityId: page.id, changes: { path: page.path } });
    await this.revalidation.trigger('pages');
    this.i18n.queueContent(dto);
    return { data: toAdmin(page) };
  }

  @Patch('admin/pages/:id')
  @RequirePermissions(PERMISSIONS.pagesWrite)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PageDto, @CurrentUser() user: AuthUser) {
    const existing = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!existing) throw notFound('Không tìm thấy trang.');
    assertFresh(existing.updatedAt, dto.expectedUpdatedAt);
    if (dto.status && dto.status !== existing.status && !user.permissions.includes(PERMISSIONS.publish)) throw forbidden();
    const data = await this.prepare(dto, id);
    const page = await this.prisma.staticPage.update({ where: { id }, data: { ...data, ...publishFields(dto.status, existing) }, include });
    await this.audit.log({ actorId: user.id, action: 'page.update', entityType: 'page', entityId: id, changes: { path: page.path, status: page.status } });
    await this.revalidation.trigger('pages');
    this.i18n.queueContent(dto);
    return { data: toAdmin(page) };
  }

  /** Hides the page from the website (kept for history; can be republished). */
  @Delete('admin/pages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.pagesWrite)
  async archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    if (!user.permissions.includes(PERMISSIONS.publish)) throw forbidden('Bạn không có quyền gỡ xuất bản.');
    const existing = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!existing) throw notFound('Không tìm thấy trang.');
    await this.prisma.staticPage.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await this.audit.log({ actorId: user.id, action: 'page.archive', entityType: 'page', entityId: id, changes: { path: existing.path } });
    await this.revalidation.trigger('pages');
  }

  /** Checks the path for its kind and builds the row data. */
  private async prepare(dto: PageDto, id?: string) {
    const kind = dto.kind ?? 'PAGE';
    const [first, ...rest] = dto.path.split('/');
    if (kind === 'SERVICE' && (first !== 'dich-vu' || rest.length !== 1))
      throw badRequest('Đường dẫn lĩnh vực có dạng dich-vu/ten-linh-vuc.', pathError('Đường dẫn lĩnh vực có dạng dich-vu/ten-linh-vuc.'));
    if (kind === 'PAGE' && (RESERVED.has(first) || (first === 'tuyen-dung' && rest.length)))
      throw badRequest(`Đường dẫn "/${dto.path}" trùng với trang có sẵn của website.`, pathError('trùng với trang có sẵn của website.'));
    const taken = await this.prisma.staticPage.findUnique({ where: { path: dto.path }, select: { id: true } });
    if (taken && taken.id !== id) throw conflict('Đường dẫn đã được dùng cho trang khác.', pathError('đã được dùng cho trang khác.'));
    if (dto.coverImageId && !(await this.prisma.mediaAsset.findFirst({ where: { id: dto.coverImageId, mimeType: { startsWith: 'image/' } } })))
      throw badRequest('Ảnh bìa không còn trong thư viện.');
    const { expectedUpdatedAt: _e, status: _s, ...data } = dto;
    return { ...data, kind, sections: data.sections.map((s) => ({ heading: s.heading, body: s.body })) };
  }
}

@Module({ controllers: [PagesController] })
export class PagesModule {}

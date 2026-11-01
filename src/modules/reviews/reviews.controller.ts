import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUrl, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import { Clean } from '../../common/dto/fields.js';
import { notFound } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ReviewSource } from '../../generated/prisma/enums.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';

// Separate classes: an inherited @IsOptional would make the create fields optional too.
class CreateReviewDto {
  @Clean() @IsString() @MinLength(2) @MaxLength(80) authorName: string;
  @IsInt() @Min(1) @Max(5) rating: number;
  @Clean() @IsString() @MinLength(10) @MaxLength(1500) content: string;
  @IsOptional() @IsEnum(ReviewSource) source?: ReviewSource;
  /** Link to the review (or the Google / Facebook page listing it). */
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(500) sourceUrl?: string | null;
  @IsISO8601({ strict: true }) reviewedAt: string;
  @IsOptional() @IsUUID() projectId?: string | null;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(9999) sortOrder?: number;
}
class ReviewDto {
  @IsOptional() @Clean() @IsString() @MinLength(2) @MaxLength(80) authorName?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @Clean() @IsString() @MinLength(10) @MaxLength(1500) content?: string;
  @IsOptional() @IsEnum(ReviewSource) source?: ReviewSource;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(500) sourceUrl?: string | null;
  @IsOptional() @IsISO8601({ strict: true }) reviewedAt?: string;
  @IsOptional() @IsUUID() projectId?: string | null;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(9999) sortOrder?: number;
}
class PublicReviewQuery {
  /** Reviews about one project (plus general ones), by project slug. */
  @IsOptional() @IsString() @MaxLength(160) project?: string;
}

const select = {
  id: true,
  authorName: true,
  rating: true,
  content: true,
  source: true,
  sourceUrl: true,
  reviewedAt: true,
  project: { select: { id: true, name: true, slug: true } },
} as const;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

/**
 * "Khách hàng nói gì": reviews entered in Admin (copied from Google,
 * Facebook or received directly) and shown on the website, newest first
 * unless ordered by hand. Only published ones are public.
 */
@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  @Public()
  @Get('reviews')
  async list(@Query() q: PublicReviewQuery) {
    const data = await this.prisma.review.findMany({
      where: {
        isPublished: true,
        ...(q.project ? { OR: [{ project: { slug: q.project } }, { projectId: null }] } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { reviewedAt: 'desc' }],
      take: 24,
      select,
    });
    return { data: data.map((r) => ({ ...r, reviewedAt: r.reviewedAt.toISOString().slice(0, 10) })) };
  }

  @Get('admin/reviews')
  @RequirePermissions(PERMISSIONS.contentRead)
  async adminList() {
    const data = await this.prisma.review.findMany({
      orderBy: [{ sortOrder: 'asc' }, { reviewedAt: 'desc' }],
      select: { ...select, isPublished: true, sortOrder: true, updatedAt: true },
    });
    return { data: data.map((r) => ({ ...r, reviewedAt: r.reviewedAt.toISOString().slice(0, 10) })) };
  }

  @Post('admin/reviews')
  @RequirePermissions(PERMISSIONS.pagesWrite)
  async create(@Body() dto: CreateReviewDto, @CurrentUser() user: AuthUser) {
    const row = await this.prisma.review.create({ data: { ...dto, reviewedAt: day(dto.reviewedAt) }, select: { id: true } });
    await this.audit.log({ actorId: user.id, action: 'review.create', entityType: 'review', entityId: row.id, changes: { authorName: dto.authorName, rating: dto.rating } });
    await this.revalidation.trigger('reviews');
    return { data: row };
  }

  @Patch('admin/reviews/:id')
  @RequirePermissions(PERMISSIONS.pagesWrite)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto, @CurrentUser() user: AuthUser) {
    if (!(await this.prisma.review.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Không tìm thấy đánh giá.');
    await this.prisma.review.update({ where: { id }, data: { ...dto, reviewedAt: dto.reviewedAt ? day(dto.reviewedAt) : undefined } });
    await this.audit.log({ actorId: user.id, action: 'review.update', entityType: 'review', entityId: id, changes: JSON.parse(JSON.stringify(dto)) });
    await this.revalidation.trigger('reviews');
    return { data: { id } };
  }

  @Delete('admin/reviews/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.pagesWrite)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    const row = await this.prisma.review.findUnique({ where: { id }, select: { authorName: true } });
    if (!row) throw notFound('Không tìm thấy đánh giá.');
    await this.prisma.review.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, action: 'review.delete', entityType: 'review', entityId: id, changes: row });
    await this.revalidation.trigger('reviews');
  }
}

@Module({ controllers: [ReviewsController] })
export class ReviewsModule {}

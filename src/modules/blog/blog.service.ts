import { Injectable } from '@nestjs/common';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { badRequest, conflict, forbidden, gone, MovedError, notFound } from '../../common/errors.js';
import { assertFresh, image, publishedWhere } from '../../common/utils/content.js';
import { slugify } from '../../common/utils/text.js';
import { PrismaService } from '../../database/prisma.service.js';
import { slugTaken } from '../../common/validation.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';
import type { AdminPostQuery, CategoryDto, CreatePostDto, PublicPostQuery, UpdatePostDto } from './blog.dto.js';

const include = {
  category: true,
  coverImage: true,
  tags: { include: { tag: true } },
} as const satisfies Prisma.BlogPostInclude;
type Row = Prisma.BlogPostGetPayload<{ include: typeof include }>;

const summary = (p: Row) => ({
  id: p.id,
  slug: p.slug,
  title: p.title,
  excerpt: p.excerpt,
  category: { slug: p.category.slug, name: p.category.name },
  tags: p.tags.map((t) => ({ slug: t.tag.slug, name: t.tag.name })),
  authorName: p.authorName,
  readingMinutes: p.readingMinutes,
  isDemo: p.isDemo,
  coverImage: image(p.coverImage, p.coverImageAlt || p.title),
  publishedAt: p.publishedAt,
  updatedAt: p.updatedAt,
});
const detail = (p: Row) => ({ ...summary(p), content: p.content, seo: { title: p.seoTitle, description: p.seoDescription } });
const admin = (p: Row) => ({ ...detail(p), status: p.status, coverImageId: p.coverImageId, coverImageAlt: p.coverImageAlt, seoTitle: p.seoTitle, seoDescription: p.seoDescription, createdAt: p.createdAt });

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  async publicList(q: PublicPostQuery) {
    const where: Prisma.BlogPostWhereInput = {
      ...publishedWhere(),
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.tag ? { tags: { some: { tag: { slug: q.tag } } } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.blogPost.findMany({ where, include, orderBy: [{ publishedAt: 'desc' }, { slug: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.blogPost.count({ where }),
    ]);
    return { data: rows.map(summary), meta: pageMeta(q.page, q.pageSize, total) };
  }

  async publicBySlug(slug: string) {
    const row = await this.prisma.blogPost.findUnique({ where: { slug }, include });
    if (row) {
      if (row.status === 'PUBLISHED' && !row.deletedAt && row.publishedAt && row.publishedAt <= new Date()) return detail(row);
      if (row.deletedAt || row.status === 'ARCHIVED') throw gone();
      throw notFound('Không tìm thấy bài viết.');
    }
    const redirect = await this.prisma.slugRedirect.findUnique({ where: { entityType_fromSlug: { entityType: 'POST', fromSlug: slug } } });
    if (redirect) {
      const target = await this.prisma.blogPost.findFirst({ where: { id: redirect.entityId, ...publishedWhere() }, select: { slug: true } });
      if (target) throw new MovedError(`/api/v1/blog/${target.slug}`, target.slug);
    }
    throw notFound('Không tìm thấy bài viết.');
  }

  /** Categories that currently have at least one public post. */
  async publicCategories() {
    const rows = await this.prisma.blogCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { posts: { where: publishedWhere() } } } },
    });
    return rows.map((c) => ({ slug: c.slug, name: c.name, description: c.description, postCount: c._count.posts }));
  }

  async adminList(q: AdminPostQuery) {
    const where: Prisma.BlogPostWhereInput = {
      deletedAt: null,
      status: q.status,
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.blogPost.findMany({ where, include, orderBy: [{ updatedAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.blogPost.count({ where }),
    ]);
    return { data: rows.map(admin), meta: pageMeta(q.page, q.pageSize, total) };
  }

  async adminGet(id: string) {
    const row = await this.prisma.blogPost.findFirst({ where: { id, deletedAt: null }, include });
    if (!row) throw notFound('Không tìm thấy bài viết.');
    return admin(row);
  }

  async previewBySlug(slug: string) {
    const row = await this.prisma.blogPost.findFirst({ where: { slug, deletedAt: null }, include });
    if (!row) throw notFound('Không tìm thấy bài viết.');
    return { ...detail(row), status: row.status };
  }

  async create(dto: CreatePostDto, user: AuthUser) {
    this.assertPublish(dto.status, undefined, user);
    const id = await this.prisma.$transaction(async (tx) => {
      if (await tx.blogPost.findUnique({ where: { slug: dto.slug }, select: { id: true } })) throw slugTaken();
      const categoryId = await this.categoryId(tx, dto.category);
      this.assertPublishable(dto.status, dto.content);
      const post = await tx.blogPost.create({
        data: {
          ...this.scalars(dto),
          slug: dto.slug,
          title: dto.title,
          excerpt: dto.excerpt,
          categoryId,
          status: dto.status ?? 'DRAFT',
          publishedAt: this.publishedAt(dto.status ?? 'DRAFT', dto.publishedAt, null),
        },
      });
      await this.writeTags(tx, post.id, dto.tags);
      await tx.slugRedirect.deleteMany({ where: { entityType: 'POST', fromSlug: dto.slug } });
      await this.audit.log({ actorId: user.id, action: 'post.create', entityType: 'post', entityId: post.id, changes: { slug: dto.slug, status: post.status } }, tx);
      return post.id;
    });
    await this.revalidation.trigger('blog');
    return this.adminGet(id);
  }

  async update(id: string, dto: UpdatePostDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.blogPost.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw notFound('Không tìm thấy bài viết.');
      assertFresh(existing.updatedAt, dto.expectedUpdatedAt);
      this.assertPublish(dto.status, existing.status, user);
      if (dto.slug && dto.slug !== existing.slug && (await tx.blogPost.findUnique({ where: { slug: dto.slug }, select: { id: true } }))) throw slugTaken();
      this.assertPublishable(dto.status ?? existing.status, dto.content === undefined ? existing.content : dto.content);
      const status = dto.status ?? existing.status;
      await tx.blogPost.update({
        where: { id },
        data: {
          ...this.scalars(dto),
          slug: dto.slug,
          title: dto.title,
          excerpt: dto.excerpt,
          categoryId: dto.category ? await this.categoryId(tx, dto.category) : undefined,
          status: dto.status,
          publishedAt: dto.status !== undefined || dto.publishedAt !== undefined ? this.publishedAt(status, dto.publishedAt, existing.publishedAt) : undefined,
        },
      });
      if (dto.slug && dto.slug !== existing.slug) {
        await tx.slugRedirect.deleteMany({ where: { entityType: 'POST', fromSlug: dto.slug } });
        await tx.slugRedirect.upsert({
          where: { entityType_fromSlug: { entityType: 'POST', fromSlug: existing.slug } },
          create: { entityType: 'POST', fromSlug: existing.slug, entityId: id },
          update: { entityId: id },
        });
      }
      if (dto.tags) await this.writeTags(tx, id, dto.tags);
      await this.audit.log({ actorId: user.id, action: 'post.update', entityType: 'post', entityId: id, changes: JSON.parse(JSON.stringify({ ...dto, content: dto.content === undefined ? undefined : '[updated]' })) }, tx);
    });
    await this.revalidation.trigger('blog');
    return this.adminGet(id);
  }

  async archive(id: string, user: AuthUser) {
    const existing = await this.prisma.blogPost.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound('Không tìm thấy bài viết.');
    await this.prisma.blogPost.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
    await this.audit.log({ actorId: user.id, action: 'post.archive', entityType: 'post', entityId: id, changes: { slug: existing.slug } });
    await this.revalidation.trigger('blog');
  }

  async categories() {
    const rows = await this.prisma.blogCategory.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { posts: { where: { deletedAt: null } } } } } });
    return rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, sortOrder: c.sortOrder, postCount: c._count.posts }));
  }
  async saveCategory(dto: CategoryDto, id: string | null, user: AuthUser) {
    const data = { slug: dto.slug, name: dto.name, description: dto.description, sortOrder: dto.sortOrder };
    const row = id ? await this.prisma.blogCategory.update({ where: { id }, data }) : await this.prisma.blogCategory.create({ data });
    await this.audit.log({ actorId: user.id, action: id ? 'blog_category.update' : 'blog_category.create', entityType: 'blog_category', entityId: row.id, changes: { ...dto } });
    await this.revalidation.trigger('blog');
    return row;
  }
  async deleteCategory(id: string, user: AuthUser) {
    if (await this.prisma.blogPost.count({ where: { categoryId: id } })) throw conflict('Chuyên mục đang có bài viết.');
    await this.prisma.blogCategory.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, action: 'blog_category.delete', entityType: 'blog_category', entityId: id });
    await this.revalidation.trigger('blog');
  }

  private assertPublish(next: string | undefined, current: string | undefined, user: AuthUser) {
    const changes = next !== undefined && next !== current && (next === 'PUBLISHED' || current === 'PUBLISHED');
    if (changes && !user.permissions.includes(PERMISSIONS.publish)) throw forbidden('Bạn không có quyền xuất bản hoặc gỡ xuất bản.');
  }
  private assertPublishable(status: string | undefined, content: string | null | undefined) {
    if (status === 'PUBLISHED' && (content ?? '').trim().length < 10)
      throw badRequest('Bài viết cần nội dung chi tiết trước khi xuất bản.');
  }
  private publishedAt(status: string, requested: string | null | undefined, current: Date | null) {
    if (status !== 'PUBLISHED') return requested ? new Date(requested) : current;
    if (requested) return new Date(requested);
    return current ?? new Date();
  }
  private scalars(dto: UpdatePostDto) {
    return {
      content: dto.content === undefined ? undefined : (dto.content ?? ''),
      authorName: dto.authorName,
      readingMinutes: dto.readingMinutes,
      isDemo: dto.isDemo,
      coverImageId: dto.coverImageId,
      coverImageAlt: dto.coverImageAlt,
      seoTitle: dto.seoTitle,
      seoDescription: dto.seoDescription,
    };
  }
  private async categoryId(tx: Prisma.TransactionClient, slug: string) {
    const category = await tx.blogCategory.findUnique({ where: { slug } });
    if (!category) throw badRequest('Chuyên mục không hợp lệ.');
    return category.id;
  }
  private async writeTags(tx: Prisma.TransactionClient, postId: string, tags: string[] | undefined) {
    if (!tags) return;
    await tx.blogPostTag.deleteMany({ where: { postId } });
    for (const name of new Set(tags)) {
      const slug = slugify(name);
      if (!slug) continue;
      const tag = await tx.blogTag.upsert({ where: { slug }, create: { slug, name }, update: {} });
      await tx.blogPostTag.create({ data: { postId, tagId: tag.id } });
    }
  }
}

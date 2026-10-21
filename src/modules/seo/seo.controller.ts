import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators.js';
import { publishedWhere } from '../../common/utils/content.js';
import { PrismaService } from '../../database/prisma.service.js';

/** Everything the frontend sitemap needs, in one request. Demo content is excluded. */
@ApiTags('seo')
@Controller('sitemap')
export class SeoController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async sitemap() {
    const live = publishedWhere();
    const { deletedAt: _d, ...pageLive } = live;
    const [projects, properties, posts, categories, pages] = await Promise.all([
      this.prisma.project.findMany({ where: live, select: { slug: true, updatedAt: true, categories: { select: { category: { select: { code: true } } } } }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.property.findMany({ where: { ...live, isDemo: false, project: live }, select: { slug: true, updatedAt: true } }),
      this.prisma.blogPost.findMany({ where: { ...live, isDemo: false }, select: { slug: true, updatedAt: true } }),
      this.prisma.blogCategory.findMany({ where: { posts: { some: { ...live, isDemo: false } } }, select: { slug: true } }),
      this.prisma.staticPage.findMany({ where: pageLive, select: { path: true, updatedAt: true } }),
    ]);
    return {
      data: {
        projects: projects.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt, categories: p.categories.map((c) => c.category.code) })),
        properties,
        posts,
        blogCategories: categories.map((c) => c.slug),
        pages,
      },
    };
  }
}

@Module({ controllers: [SeoController] })
export class SeoModule {}

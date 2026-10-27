import { Injectable } from '@nestjs/common';
import { badRequest, conflict, forbidden, gone, MovedError, notFound } from '../../common/errors.js';
import { assertFresh, image, publishedWhere, publishFields } from '../../common/utils/content.js';
import { normalize } from '../../common/utils/text.js';
import { PrismaService } from '../../database/prisma.service.js';
import { editorsOf, statusCounts } from '../../common/utils/admin-list.js';
import { slugTaken } from '../../common/validation.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { BannersService } from '../banners/banners.service.js';
import { I18nService } from '../i18n/i18n.service.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';
import type { AdminProjectQuery, CreateProjectDto, PublicProjectQuery, UpdateProjectDto } from './projects.dto.js';
import { projectInclude, toAdminProject, toPublicProject } from './projects.mapper.js';
import { pageMeta } from '../../common/dto/pagination.dto.js';

type Tx = Prisma.TransactionClient;
const date = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(`${value.slice(0, 10)}T00:00:00Z`);

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly banners: BannersService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
    private readonly i18n: I18nService,
  ) {}

  // ─────────────── public ───────────────
  async publicList(q: PublicProjectQuery) {
    const where: Prisma.ProjectWhereInput = {
      ...publishedWhere(),
      ...(q.category ? { categories: { some: { category: { code: q.category } } } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: projectInclude,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);
    return { data: rows.map(toPublicProject), meta: pageMeta(q.page, q.pageSize, total) };
  }

  async publicBySlug(slug: string) {
    const project = await this.prisma.project.findUnique({ where: { slug }, include: projectInclude });
    if (project) {
      const live = publishedWhere();
      if (project.status === 'PUBLISHED' && !project.deletedAt && project.publishedAt && project.publishedAt <= live.publishedAt.lte)
        return toPublicProject(project);
      if (project.deletedAt || project.status === 'ARCHIVED') throw gone();
      throw notFound('Không tìm thấy dự án.');
    }
    const redirect = await this.prisma.slugRedirect.findUnique({
      where: { entityType_fromSlug: { entityType: 'PROJECT', fromSlug: slug } },
    });
    if (redirect) {
      const target = await this.prisma.project.findFirst({ where: { id: redirect.entityId, ...publishedWhere() }, select: { slug: true } });
      if (target) throw new MovedError(`/api/v1/projects/${target.slug}`, target.slug);
    }
    throw notFound('Không tìm thấy dự án.');
  }

  async categories() {
    return this.prisma.projectCategory.findMany({ orderBy: { sortOrder: 'asc' }, select: { code: true, name: true } });
  }

  // ─────────────── admin ───────────────
  async adminList(q: AdminProjectQuery) {
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      status: q.status,
      ...(q.category ? { categories: { some: { category: { code: q.category } } } } : {}),
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: normalize(q.q) } }, { location: { contains: q.q, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total, byStatus] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: { ...projectInclude, _count: { select: { properties: { where: { deletedAt: null } } } }, banner: { select: { id: true, isActive: true } } },
        orderBy:
          q.sort === 'created'
            ? [{ createdAt: 'desc' }, { id: 'asc' }]
            : q.sort === 'updated'
              ? [{ updatedAt: 'desc' }, { id: 'asc' }]
              : q.sort === 'name'
                ? [{ name: 'asc' }, { id: 'asc' }]
                : [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.project.count({ where }),
      this.prisma.project.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true }, orderBy: { status: 'asc' } }),
    ]);
    const editors = await editorsOf(this.prisma, 'project', 'project', rows.map((r) => r.id));
    return {
      data: rows.map((row) => ({ ...toAdminProject(row), banner: row.banner, ...(editors.get(row.id) ?? { createdBy: null, updatedBy: null }) })),
      meta: { ...pageMeta(q.page, q.pageSize, total), byStatus: statusCounts(byStatus) },
    };
  }

  async adminGet(id: string) {
    const row = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: { ...projectInclude, _count: { select: { properties: { where: { deletedAt: null } } } } },
    });
    if (!row) throw notFound('Không tìm thấy dự án.');
    const banner = await this.prisma.banner.findUnique({ where: { projectId: id }, include: { image: true, mobileImage: true } });
    return {
      ...toAdminProject(row),
      banner: banner && {
        id: banner.id,
        isActive: banner.isActive,
        useProjectImage: banner.useProjectImage,
        imageId: banner.imageId,
        mobileImageId: banner.mobileImageId,
        image: image(banner.image),
        mobileImage: image(banner.mobileImage),
        imageAlt: banner.imageAlt,
        label: banner.label,
        title: banner.title,
        description: banner.description,
        sortOrder: banner.sortOrder,
        updatedAt: banner.updatedAt,
      },
    };
  }

  /** Draft/preview lookup by slug for authenticated editors. */
  async previewBySlug(slug: string) {
    const row = await this.prisma.project.findFirst({ where: { slug, deletedAt: null }, include: projectInclude });
    if (!row) throw notFound('Không tìm thấy dự án.');
    return { ...toPublicProject(row), status: row.status };
  }

  async create(dto: CreateProjectDto, user: AuthUser) {
    this.assertPublishRight(dto.status, undefined, user);
    const id = await this.prisma.$transaction(async (tx) => {
      if (await tx.project.findUnique({ where: { slug: dto.slug }, select: { id: true } })) throw slugTaken();
      const project = await tx.project.create({
        data: { ...this.scalarData(dto), slug: dto.slug, name: dto.name, location: dto.location, intro: dto.intro, ...publishFields(dto.status ?? 'DRAFT', undefined, dto.publishedAt ? new Date(dto.publishedAt) : undefined) },
      });
      await this.writeRelations(tx, project.id, dto);
      await this.removeRedirect(tx, dto.slug);
      if (dto.banner) await this.banners.syncProjectBanner(tx, project.id, dto.banner);
      await this.audit.log({ actorId: user.id, action: 'project.create', entityType: 'project', entityId: project.id, changes: { slug: dto.slug, status: project.status, banner: dto.banner?.enabled ?? false } }, tx);
      return project.id;
    });
    await this.revalidation.trigger('projects', 'banners', 'properties');
    this.i18n.queueContent(dto);
    return this.adminGet(id);
  }

  async update(id: string, dto: UpdateProjectDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.project.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw notFound('Không tìm thấy dự án.');
      assertFresh(existing.updatedAt, dto.expectedUpdatedAt);
      this.assertPublishRight(dto.status, existing.status, user);
      if (dto.slug && dto.slug !== existing.slug && (await tx.project.findUnique({ where: { slug: dto.slug }, select: { id: true } }))) throw slugTaken();
      if (dto.banner) {
        const banner = await tx.banner.findUnique({ where: { projectId: id } });
        // The banner may have been edited from the banner module meanwhile.
        if (banner && dto.banner.expectedBannerUpdatedAt && banner.updatedAt.toISOString() !== dto.banner.expectedBannerUpdatedAt)
          throw conflict('Banner của dự án đã thay đổi ở mục Banner. Hãy tải lại trước khi lưu.');
      }
      await tx.project.update({
        where: { id },
        data: {
          ...this.scalarData(dto),
          slug: dto.slug,
          name: dto.name,
          location: dto.location,
          intro: dto.intro,
          ...publishFields(dto.status, existing, dto.publishedAt ? new Date(dto.publishedAt) : undefined),
        },
      });
      if (dto.slug && dto.slug !== existing.slug) {
        await this.removeRedirect(tx, dto.slug);
        await tx.slugRedirect.upsert({
          where: { entityType_fromSlug: { entityType: 'PROJECT', fromSlug: existing.slug } },
          create: { entityType: 'PROJECT', fromSlug: existing.slug, entityId: id },
          update: { entityId: id },
        });
      }
      await this.writeRelations(tx, id, dto);
      if (dto.banner) await this.banners.syncProjectBanner(tx, id, dto.banner);
      await this.audit.log({ actorId: user.id, action: 'project.update', entityType: 'project', entityId: id, changes: JSON.parse(JSON.stringify({ ...dto, overview: undefined })) }, tx);
    });
    await this.revalidation.trigger('projects', 'banners', 'properties');
    this.i18n.queueContent(dto);
    return this.adminGet(id);
  }

  /**
   * Archives (soft-deletes) a project. Refused while units still reference
   * it; its homepage banner is removed and the slug answers 410.
   */
  async archive(id: string, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.project.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw notFound('Không tìm thấy dự án.');
      const units = await tx.property.count({ where: { projectId: id, deletedAt: null } });
      if (units) throw conflict('Dự án đang có căn hộ liên kết. Hãy chuyển hoặc xóa các căn hộ trước.', { properties: units });
      await tx.project.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
      const banner = await tx.banner.findUnique({ where: { projectId: id } });
      if (banner) {
        await tx.banner.delete({ where: { id: banner.id } });
        await this.banners.renumber(tx);
      }
      await this.audit.log({ actorId: user.id, action: 'project.archive', entityType: 'project', entityId: id, changes: { slug: existing.slug, bannerRemoved: !!banner } }, tx);
    });
    await this.revalidation.trigger('projects', 'banners', 'properties');
  }

  private assertPublishRight(next: string | undefined, current: string | undefined, user: AuthUser) {
    const changes = next !== undefined && next !== current && (next === 'PUBLISHED' || current === 'PUBLISHED');
    if (changes && !user.permissions.includes(PERMISSIONS.publish))
      throw forbidden('Bạn không có quyền xuất bản hoặc gỡ xuất bản.');
  }

  private scalarData(dto: UpdateProjectDto) {
    if ((dto.latitude == null) !== (dto.longitude == null) && (dto.latitude !== undefined || dto.longitude !== undefined))
      throw badRequest('Cần nhập đủ cả vĩ độ và kinh độ.');
    if (dto.startDate && dto.handoverDate && dto.startDate > dto.handoverDate)
      throw badRequest('Ngày bàn giao không được trước ngày khởi công.');
    return {
      stage: dto.stage,
      propertyKind: dto.propertyKind,
      address: dto.address,
      overview: dto.overview,
      products: dto.products,
      developer: dto.developer,
      companyRole: dto.companyRole,
      legalStatus: dto.legalStatus,
      totalAreaM2: dto.totalAreaM2,
      totalUnits: dto.totalUnits,
      startDate: date(dto.startDate),
      handoverDate: date(dto.handoverDate),
      mapUrl: dto.mapUrl,
      facebookUrl: dto.facebookUrl,
      mapLabel: dto.mapLabel,
      latitude: dto.latitude,
      longitude: dto.longitude,
      coverImageId: dto.coverImageId,
      coverImageAlt: dto.coverImageAlt,
      imageCredit: dto.imageCredit,
      sourceUrl: dto.sourceUrl,
      rentalIntro: dto.rentalIntro,
      rentalFocus: dto.rentalFocus,
      rentalChecks: dto.rentalChecks,
      seoTitle: dto.seoTitle,
      seoDescription: dto.seoDescription,
      sortOrder: dto.sortOrder,
    };
  }

  private async writeRelations(tx: Tx, projectId: string, dto: UpdateProjectDto) {
    if (dto.categories) {
      if (!dto.categories.length) throw badRequest('Dự án cần ít nhất một nhóm phân loại.');
      const categories = await tx.projectCategory.findMany({ where: { code: { in: dto.categories } } });
      if (categories.length !== dto.categories.length) throw badRequest('Nhóm phân loại không hợp lệ.');
      await tx.projectCategoryOnProject.deleteMany({ where: { projectId } });
      await tx.projectCategoryOnProject.createMany({ data: categories.map((c) => ({ projectId, categoryId: c.id })) });
    }
    if (dto.amenities) {
      await tx.projectAmenity.deleteMany({ where: { projectId } });
      await tx.projectAmenity.createMany({ data: dto.amenities.map((name, sortOrder) => ({ projectId, name, sortOrder })) });
    }
    if (dto.highlights) {
      await tx.projectHighlight.deleteMany({ where: { projectId } });
      await tx.projectHighlight.createMany({ data: dto.highlights.map((h, sortOrder) => ({ projectId, title: h.title, text: h.text, sortOrder })) });
    }
    if (dto.galleryImageIds) {
      await this.banners.assertMedia(tx, ...dto.galleryImageIds);
      await tx.projectImage.deleteMany({ where: { projectId } });
      await tx.projectImage.createMany({ data: dto.galleryImageIds.map((mediaId, sortOrder) => ({ projectId, mediaId, sortOrder })) });
    }
    if (dto.coverImageId) await this.banners.assertMedia(tx, dto.coverImageId);
  }

  /** A slug taken by a live project can no longer be a redirect source. */
  private removeRedirect(tx: Tx, slug: string) {
    return tx.slugRedirect.deleteMany({ where: { entityType: 'PROJECT', fromSlug: slug } });
  }
}

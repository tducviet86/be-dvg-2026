import { Injectable } from '@nestjs/common';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { assertFresh, image, publishedWhere } from '../../common/utils/content.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;
export type BannerContent = {
  label?: string | null;
  title?: string | null;
  description?: string | null;
  imageId?: string | null;
  mobileImageId?: string | null;
  imageAlt?: string | null;
  useProjectImage?: boolean;
};
export type ProjectBannerInput = BannerContent & {
  enabled: boolean;
  position?: number;
};

const adminInclude = {
  image: true,
  mobileImage: true,
  project: {
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      deletedAt: true,
      publishedAt: true,
      coverImage: true,
      coverImageAlt: true,
    },
  },
} as const;
type AdminBanner = Prisma.BannerGetPayload<{ include: typeof adminInclude }>;

/** Serialises every ordering change (one global banner sequence). */
const lockOrdering = (tx: Tx) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(812004)`;

@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public slides: active, linked project public, ordered, single query. */
  async publicList() {
    const rows = await this.prisma.banner.findMany({
      where: {
        isActive: true,
        OR: [{ type: 'NORMAL' }, { project: publishedWhere() }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: adminInclude,
    });
    return rows
      .map((row) => this.resolve(row))
      .filter((b) => b.image)
      .map(({ project: _p, isActive: _a, sortOrder: _s, ...rest }) => rest);
  }

  async adminList() {
    const rows = await this.prisma.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: adminInclude,
    });
    return rows.map((row) => this.toAdmin(row));
  }

  async get(id: string) {
    const row = await this.prisma.banner.findUnique({ where: { id }, include: adminInclude });
    if (!row) throw notFound('Không tìm thấy banner.');
    return this.toAdmin(row);
  }

  /** Content shown for a banner, falling back to the project's data. */
  resolve(row: AdminBanner) {
    const project = row.project;
    const useProject = !!project && (row.useProjectImage || !row.image);
    const projectPublic =
      !!project &&
      project.status === 'PUBLISHED' &&
      !project.deletedAt &&
      !!project.publishedAt &&
      project.publishedAt <= new Date();
    const alt =
      row.imageAlt ||
      (project ? project.coverImageAlt || `Phối cảnh dự án ${project.name}` : row.title || '');
    return {
      id: row.id,
      type: row.type,
      label: row.label || (project ? 'DỰ ÁN NỔI BẬT' : null),
      title: row.title || project?.name || '',
      description: row.description,
      image: useProject ? image(project.coverImage, alt) : image(row.image, alt),
      mobileImage: useProject ? null : image(row.mobileImage, alt),
      href: project && projectPublic ? `/du-an/${project.slug}` : null,
      projectName: project?.name ?? null,
      project,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    };
  }

  private toAdmin(row: AdminBanner) {
    const resolved = this.resolve(row);
    const project = row.project;
    return {
      id: row.id,
      type: row.type,
      label: row.label,
      title: row.title,
      description: row.description,
      imageAlt: row.imageAlt,
      image: image(row.image),
      mobileImage: image(row.mobileImage),
      useProjectImage: row.useProjectImage,
      projectId: row.projectId,
      project: project && {
        id: project.id,
        slug: project.slug,
        name: project.name,
        status: project.status,
        deleted: !!project.deletedAt,
      },
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      publiclyVisible: row.isActive && !!resolved.image && (!project || !!resolved.href),
      preview: {
        label: resolved.label,
        title: resolved.title,
        description: resolved.description,
        image: resolved.image,
        mobileImage: resolved.mobileImage,
        href: resolved.href ?? (project ? `/du-an/${project.slug}` : null),
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Moves `bannerId` to 1-based `position` and renumbers 1..n. */
  async place(tx: Tx, bannerId: string, position?: number) {
    await lockOrdering(tx);
    const all = await tx.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, sortOrder: true },
    });
    const current = all.find((b) => b.id === bannerId);
    const others = all.filter((b) => b.id !== bannerId);
    const target = position ?? current?.sortOrder ?? all.length;
    const index = Math.min(Math.max(Math.round(target) - 1, 0), others.length);
    others.splice(index, 0, { id: bannerId, sortOrder: -1 });
    for (const [i, banner] of others.entries())
      if (banner.sortOrder !== i + 1)
        await tx.banner.update({ where: { id: banner.id }, data: { sortOrder: i + 1 } });
  }

  async renumber(tx: Tx) {
    await lockOrdering(tx);
    const all = await tx.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, sortOrder: true },
    });
    for (const [i, banner] of all.entries())
      if (banner.sortOrder !== i + 1)
        await tx.banner.update({ where: { id: banner.id }, data: { sortOrder: i + 1 } });
  }

  /** Media used as pictures (covers, banners, project galleries) must be images. */
  async assertMedia(tx: Tx, ...ids: (string | null | undefined)[]) {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))];
    if (!wanted.length) return;
    const found = await tx.mediaAsset.findMany({ where: { id: { in: wanted } }, select: { mimeType: true } });
    if (found.length !== wanted.length) throw badRequest('Ảnh đã chọn không còn tồn tại.');
    if (found.some((m) => !m.mimeType.startsWith('image/')))
      throw badRequest('Chỉ được dùng ảnh ở vị trí này (không dùng video).');
  }

  /**
   * Upserts the single banner of a project (keyed by projectId). Disabling
   * only deactivates it so content survives; never deletes the project.
   */
  async syncProjectBanner(tx: Tx, projectId: string, input: ProjectBannerInput) {
    const existing = await tx.banner.findUnique({ where: { projectId } });
    if (!existing && !input.enabled) return null;
    if (!input.enabled)
      return tx.banner.update({ where: { id: existing!.id }, data: { isActive: false } });
    const useProjectImage = input.useProjectImage ?? existing?.useProjectImage ?? true;
    const imageId = useProjectImage ? null : (input.imageId ?? existing?.imageId ?? null);
    const mobileImageId = useProjectImage ? null : (input.mobileImageId ?? null);
    if (!useProjectImage && !imageId)
      throw badRequest('Hãy chọn ảnh dự án hoặc tải lên ảnh banner riêng.');
    if (useProjectImage) {
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { coverImageId: true } });
      if (!project?.coverImageId)
        throw badRequest('Dự án chưa có ảnh đại diện. Hãy thêm ảnh đại diện hoặc tải lên ảnh banner riêng.');
    }
    await this.assertMedia(tx, imageId, mobileImageId);
    const data = {
      label: input.label ?? null,
      title: input.title ?? null,
      description: input.description ?? null,
      imageAlt: input.imageAlt ?? null,
      useProjectImage,
      imageId,
      mobileImageId,
      isActive: true,
    };
    const banner = existing
      ? await tx.banner.update({ where: { id: existing.id }, data })
      : await tx.banner.create({
          data: {
            ...data,
            type: 'PROJECT',
            projectId,
            sortOrder: (await tx.banner.count()) + 1,
          },
        });
    await this.place(tx, banner.id, input.position);
    return banner;
  }

  async create(
    tx: Tx,
    input: BannerContent & {
      type: 'NORMAL' | 'PROJECT';
      projectId?: string | null;
      isActive?: boolean;
      position?: number;
    },
  ) {
    if (input.type === 'PROJECT') {
      if (!input.projectId) throw badRequest('Banner dự án cần chọn dự án.');
      const project = await tx.project.findFirst({ where: { id: input.projectId, deletedAt: null } });
      if (!project) throw badRequest('Dự án liên kết không tồn tại.');
      if (await tx.banner.findUnique({ where: { projectId: input.projectId } }))
        throw conflict('Dự án này đã có banner. Hãy chỉnh sửa banner hiện có.');
    } else if (input.projectId) throw badRequest('Banner thường không liên kết dự án.');
    const useProjectImage = input.type === 'PROJECT' && (input.useProjectImage ?? false);
    if (!useProjectImage && !input.imageId) throw badRequest('Banner cần ảnh.');
    await this.assertMedia(tx, input.imageId, input.mobileImageId);
    const banner = await tx.banner.create({
      data: {
        type: input.type,
        projectId: input.type === 'PROJECT' ? input.projectId : null,
        label: input.label ?? null,
        title: input.title ?? null,
        description: input.description ?? null,
        imageAlt: input.imageAlt ?? null,
        imageId: useProjectImage ? null : input.imageId,
        mobileImageId: useProjectImage ? null : (input.mobileImageId ?? null),
        useProjectImage,
        isActive: input.isActive ?? true,
        sortOrder: (await tx.banner.count()) + 1,
      },
    });
    await this.place(tx, banner.id, input.position);
    return banner;
  }

  async update(
    tx: Tx,
    id: string,
    input: BannerContent & { isActive?: boolean; position?: number; expectedUpdatedAt?: string },
  ) {
    const existing = await tx.banner.findUnique({ where: { id } });
    if (!existing) throw notFound('Không tìm thấy banner.');
    assertFresh(existing.updatedAt, input.expectedUpdatedAt);
    const useProjectImage =
      existing.type === 'PROJECT' ? (input.useProjectImage ?? existing.useProjectImage) : false;
    const imageId = useProjectImage
      ? null
      : input.imageId === undefined
        ? existing.imageId
        : input.imageId;
    const mobileImageId = useProjectImage
      ? null
      : input.mobileImageId === undefined
        ? existing.mobileImageId
        : input.mobileImageId;
    if (!useProjectImage && !imageId) throw badRequest('Banner cần ảnh.');
    await this.assertMedia(tx, imageId, mobileImageId);
    const banner = await tx.banner.update({
      where: { id },
      data: {
        label: input.label,
        title: input.title,
        description: input.description,
        imageAlt: input.imageAlt,
        useProjectImage,
        imageId,
        mobileImageId,
        isActive: input.isActive,
      },
    });
    if (input.position !== undefined) await this.place(tx, id, input.position);
    return banner;
  }
}

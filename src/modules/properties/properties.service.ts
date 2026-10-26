import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { badRequest, forbidden, gone, MovedError, notFound } from '../../common/errors.js';
import { assertFresh, image, publishedWhere, publishFields } from '../../common/utils/content.js';
import { decimal, isoDate, money, toBigInt } from '../../common/utils/serialize.js';
import { normalize, slugify } from '../../common/utils/text.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { I18nService } from '../i18n/i18n.service.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';
import type { AdminPropertyQuery, CreatePropertyDto, PublicPropertyQuery, UpdatePropertyDto } from './properties.dto.js';

const include = {
  project: { select: { id: true, slug: true, name: true, status: true, deletedAt: true, publishedAt: true } },
  propertyType: true,
  coverImage: true,
  images: { include: { media: true }, orderBy: { sortOrder: 'asc' } },
  amenities: { orderBy: { sortOrder: 'asc' } },
} as const satisfies Prisma.PropertyInclude;
type Row = Prisma.PropertyGetPayload<{ include: typeof include }>;

/**
 * "Đang được quan tâm": views and enquiries over the last INTEREST_DAYS days,
 * an enquiry weighing as much as LEAD_WEIGHT views.
 */
export const INTEREST_DAYS = 14;
export const TRENDING_SCORE = 20;
const LEAD_WEIGHT = 5;
export type Interest = { views: number; leads: number };
const trending = (i?: Interest) => !!i && i.views + i.leads * LEAD_WEIGHT >= TRENDING_SCORE;
/** Crawlers and link previews do not count as interest. */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|lighthouse|headless|curl|wget|python|axios|node-fetch/i;

function toPublic(p: Row, interest?: Interest) {
  const alt = p.coverImageAlt || `${p.name}${p.isDemo ? ' · Ảnh nội thất minh họa' : ''}`;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    project: { id: p.project.id, slug: p.project.slug, name: p.project.name },
    propertyType: { code: p.propertyType.code, name: p.propertyType.name },
    unitCode: p.unitCode,
    forRent: p.forRent,
    forSale: p.forSale,
    isConsignment: p.isConsignment,
    availability: p.availability,
    isDemo: p.isDemo,
    location: p.location,
    address: p.address,
    areaM2: decimal(p.areaM2)!,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    floor: p.floor,
    direction: p.direction,
    furnishing: p.furnishing,
    rentPriceVnd: money(p.rentPriceVnd),
    salePriceVnd: money(p.salePriceVnd),
    depositVnd: money(p.depositVnd),
    managementFeeVnd: money(p.managementFeeVnd),
    minimumLeaseMonths: p.minimumLeaseMonths,
    availableFrom: isoDate(p.availableFrom),
    contactName: p.contactName,
    contactPhone: p.contactPhone,
    rentalPolicy: p.rentalPolicy,
    description: p.description,
    coverImage: image(p.coverImage, alt),
    gallery: p.images.map((i, n) => image(i.media, `${alt} ${n + 1}`)!),
    amenities: p.amenities.map((a) => a.name),
    videoUrl: p.videoUrl,
    seo: { title: p.seoTitle, description: p.seoDescription },
    highlight: p.highlight,
    trending: trending(interest),
    publishedAt: p.publishedAt,
    updatedAt: p.updatedAt,
  };
}
function toAdmin(p: Row, interest?: Interest) {
  return {
    ...toPublic(p, interest),
    interest: { days: INTEREST_DAYS, views: interest?.views ?? 0, leads: interest?.leads ?? 0 },
    status: p.status,
    projectId: p.projectId,
    coverImageId: p.coverImageId,
    coverImageAlt: p.coverImageAlt,
    galleryImageIds: p.images.map((i) => i.mediaId),
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    createdAt: p.createdAt,
  };
}
const orderBy = (sort?: string): Prisma.PropertyOrderByWithRelationInput[] =>
  sort === 'price-asc'
    ? [{ rentPriceVnd: { sort: 'asc', nulls: 'last' } }]
    : sort === 'price-desc'
      ? [{ rentPriceVnd: { sort: 'desc', nulls: 'last' } }]
      : sort === 'area'
        ? [{ areaM2: 'desc' }]
        : // Default and "newest": real units before samples, latest listing first.
          [
            { isDemo: 'asc' },
            { publishedAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
            { id: 'asc' },
          ];
const date = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(`${value.slice(0, 10)}T00:00:00Z`);

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
    private readonly i18n: I18nService,
  ) {}

  private filters(q: PublicPropertyQuery): Prisma.PropertyWhereInput {
    return {
      // Every word must match (accent-insensitive), in any order.
      ...(q.q ? { AND: normalize(q.q).split(/[^a-z0-9]+/).filter(Boolean).slice(0, 8).map((word) => ({ searchText: { contains: word } })) } : {}),
      ...(q.location ? { location: q.location } : {}),
      ...(q.project ? { project: { slug: q.project } } : {}),
      ...(q.type ? { propertyType: { code: q.type } } : {}),
      ...(q.maxRentVnd ? { rentPriceVnd: { lte: BigInt(q.maxRentVnd) } } : {}),
      ...(q.bedrooms !== undefined ? { bedrooms: q.bedrooms } : {}),
      ...(q.minArea !== undefined ? { areaM2: { gte: q.minArea } } : {}),
      ...(q.furnishing ? { furnishing: q.furnishing } : {}),
      ...(q.availability ? { availability: q.availability } : {}),
      ...(q.listing === 'rent' ? { forRent: true } : q.listing === 'sale' ? { forSale: true } : {}),
    };
  }

  async publicList(q: PublicPropertyQuery) {
    const where: Prisma.PropertyWhereInput = { ...publishedWhere(), project: publishedWhere(), ...this.filters(q) };
    if (q.project) where.project = { ...publishedWhere(), slug: q.project };
    const [rows, total, facets] = await Promise.all([
      this.prisma.property.findMany({ where, include, orderBy: orderBy(q.sort), skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.property.count({ where }),
      this.prisma.property.findMany({
        where: { ...publishedWhere(), project: publishedWhere() },
        distinct: ['location'],
        select: { location: true },
        orderBy: { location: 'asc' },
      }),
    ]);
    const interest = await this.interest(rows.map((r) => r.id));
    return { data: rows.map((r) => toPublic(r, interest.get(r.id))), meta: { ...pageMeta(q.page, q.pageSize, total), locations: facets.map((f) => f.location) } };
  }

  async publicBySlug(slug: string) {
    const row = await this.prisma.property.findUnique({ where: { slug }, include });
    const live = (p: { status: string; deletedAt: Date | null; publishedAt: Date | null }) =>
      p.status === 'PUBLISHED' && !p.deletedAt && !!p.publishedAt && p.publishedAt <= new Date();
    if (row) {
      if (live(row) && live(row.project)) return toPublic(row, (await this.interest([row.id])).get(row.id));
      if (row.deletedAt || row.status === 'ARCHIVED') throw gone();
      throw notFound('Không tìm thấy căn hộ.');
    }
    const redirect = await this.prisma.slugRedirect.findUnique({ where: { entityType_fromSlug: { entityType: 'PROPERTY', fromSlug: slug } } });
    if (redirect) {
      const target = await this.prisma.property.findFirst({ where: { id: redirect.entityId, ...publishedWhere() }, select: { slug: true } });
      if (target) throw new MovedError(`/api/v1/properties/${target.slug}`, target.slug);
    }
    throw notFound('Không tìm thấy căn hộ.');
  }

  /** Views and enquiries per unit over the last INTEREST_DAYS days. */
  async interest(ids: string[]): Promise<Map<string, Interest>> {
    const result = new Map<string, Interest>();
    if (!ids.length) return result;
    const since = new Date(Date.now() - INTEREST_DAYS * 86_400_000);
    const [views, leads] = await Promise.all([
      this.prisma.propertyViewDay.groupBy({
        by: ['propertyId'],
        where: { propertyId: { in: ids }, day: { gte: new Date(since.toISOString().slice(0, 10)) } },
        _sum: { views: true },
      }),
      this.prisma.lead.groupBy({
        by: ['propertyId'],
        where: { propertyId: { in: ids }, createdAt: { gte: since }, deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    const entry = (id: string) => result.get(id) ?? (result.set(id, { views: 0, leads: 0 }), result.get(id)!);
    for (const v of views) entry(v.propertyId).views = v._sum.views ?? 0;
    for (const l of leads) if (l.propertyId) entry(l.propertyId).leads = l._count._all;
    return result;
  }

  /** Counts one page view of a live unit (sample units and crawlers excluded). */
  async recordView(slug: string, userAgent = '') {
    if (!userAgent || BOT.test(userAgent)) return;
    const row = await this.prisma.property.findFirst({
      where: { slug, isDemo: false, ...publishedWhere(), project: publishedWhere() },
      select: { id: true },
    });
    if (!row) return;
    const day = new Date(new Date().toISOString().slice(0, 10));
    await this.prisma.propertyViewDay.upsert({
      where: { propertyId_day: { propertyId: row.id, day } },
      create: { propertyId: row.id, day, views: 1 },
      update: { views: { increment: 1 } },
    });
  }

  types() {
    return this.prisma.propertyType.findMany({ orderBy: { sortOrder: 'asc' }, select: { code: true, name: true } });
  }

  async adminList(q: AdminPropertyQuery) {
    const where: Prisma.PropertyWhereInput = { deletedAt: null, status: q.status, ...this.filters(q) };
    const [rows, total] = await Promise.all([
      this.prisma.property.findMany({ where, include, orderBy: orderBy(q.sort), skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.property.count({ where }),
    ]);
    const interest = await this.interest(rows.map((r) => r.id));
    return { data: rows.map((r) => toAdmin(r, interest.get(r.id))), meta: pageMeta(q.page, q.pageSize, total) };
  }

  async adminGet(id: string) {
    const row = await this.prisma.property.findFirst({ where: { id, deletedAt: null }, include });
    if (!row) throw notFound('Không tìm thấy căn hộ.');
    return toAdmin(row, (await this.interest([row.id])).get(row.id));
  }

  async previewBySlug(slug: string) {
    const row = await this.prisma.property.findFirst({ where: { slug, deletedAt: null }, include });
    if (!row) throw notFound('Không tìm thấy căn hộ.');
    return { ...toPublic(row), status: row.status };
  }

  async create(dto: CreatePropertyDto, user: AuthUser) {
    this.assertPublishRight(dto.status, undefined, user);
    const id = await this.prisma.$transaction(async (tx) => {
      const refs = await this.references(tx, dto);
      const newId = randomUUID();
      const unitCode = dto.unitCode || (await this.autoUnitCode(tx, newId));
      const slug = await this.freeSlug(tx, dto.slug || dto.name, unitCode);
      const row = await tx.property.create({
        data: {
          ...this.scalars(dto),
          id: newId,
          unitCode,
          slug,
          name: dto.name,
          location: dto.location,
          areaM2: dto.areaM2,
          bedrooms: dto.bedrooms,
          bathrooms: dto.bathrooms,
          description: dto.description,
          projectId: dto.projectId,
          propertyTypeId: refs.typeId!,
          searchText: this.searchText(dto.name, unitCode, dto.location, refs.projectName),
          ...publishFields(dto.status ?? 'DRAFT'),
        },
      });
      await this.relations(tx, row.id, dto);
      await tx.slugRedirect.deleteMany({ where: { entityType: 'PROPERTY', fromSlug: slug } });
      await this.audit.log({ actorId: user.id, action: 'property.create', entityType: 'property', entityId: row.id, changes: { slug, unitCode, projectId: dto.projectId } }, tx);
      return row.id;
    });
    await this.revalidation.trigger('properties', 'projects');
    this.i18n.queueContent(dto);
    return this.adminGet(id);
  }

  async update(id: string, dto: UpdatePropertyDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.property.findFirst({ where: { id, deletedAt: null }, include: { project: { select: { name: true } } } });
      if (!existing) throw notFound('Không tìm thấy căn hộ.');
      assertFresh(existing.updatedAt, dto.expectedUpdatedAt);
      this.assertPublishRight(dto.status, existing.status, user);
      const refs = await this.references(tx, dto);
      // An empty unit code gets one; a slug already in use gets the unit code added.
      const unitCode = (dto.unitCode === undefined ? existing.unitCode : dto.unitCode) || (await this.autoUnitCode(tx, id));
      const slug = dto.slug && dto.slug !== existing.slug ? await this.freeSlug(tx, dto.slug, unitCode, id) : undefined;
      await tx.property.update({
        where: { id },
        data: {
          ...this.scalars(dto),
          unitCode,
          slug,
          name: dto.name,
          location: dto.location,
          areaM2: dto.areaM2,
          bedrooms: dto.bedrooms,
          bathrooms: dto.bathrooms,
          description: dto.description,
          projectId: dto.projectId,
          propertyTypeId: refs.typeId,
          searchText: this.searchText(dto.name ?? existing.name, unitCode, dto.location ?? existing.location, refs.projectName ?? existing.project.name),
          ...publishFields(dto.status, existing),
        },
      });
      if (slug) {
        await tx.slugRedirect.deleteMany({ where: { entityType: 'PROPERTY', fromSlug: slug } });
        await tx.slugRedirect.upsert({
          where: { entityType_fromSlug: { entityType: 'PROPERTY', fromSlug: existing.slug } },
          create: { entityType: 'PROPERTY', fromSlug: existing.slug, entityId: id },
          update: { entityId: id },
        });
      }
      await this.relations(tx, id, dto);
      await this.audit.log({ actorId: user.id, action: 'property.update', entityType: 'property', entityId: id, changes: JSON.parse(JSON.stringify(dto)) }, tx);
    });
    await this.revalidation.trigger('properties', 'projects');
    this.i18n.queueContent(dto);
    return this.adminGet(id);
  }

  async archive(id: string, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.property.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw notFound('Không tìm thấy căn hộ.');
      await tx.property.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
      await this.audit.log({ actorId: user.id, action: 'property.archive', entityType: 'property', entityId: id, changes: { slug: existing.slug } }, tx);
    });
    await this.revalidation.trigger('properties', 'projects');
  }

  private assertPublishRight(next: string | undefined, current: string | undefined, user: AuthUser) {
    const changes = next !== undefined && next !== current && (next === 'PUBLISHED' || current === 'PUBLISHED');
    if (changes && !user.permissions.includes(PERMISSIONS.publish)) throw forbidden('Bạn không có quyền xuất bản hoặc gỡ xuất bản.');
  }

  private searchText(...parts: (string | null | undefined)[]) {
    return normalize(parts.filter(Boolean).join(' '));
  }

  private async references(tx: Prisma.TransactionClient, dto: UpdatePropertyDto) {
    let typeId: string | undefined;
    let projectName: string | undefined;
    if (dto.propertyType) {
      const type = await tx.propertyType.findUnique({ where: { code: dto.propertyType } });
      if (!type) throw badRequest('Loại căn hộ không hợp lệ.');
      typeId = type.id;
    }
    if (dto.projectId) {
      const project = await tx.project.findFirst({ where: { id: dto.projectId, deletedAt: null } });
      if (!project) throw badRequest('Dự án liên kết không còn tồn tại.');
      projectName = project.name;
    }
    if (dto.forRent === false && dto.forSale === false) throw badRequest('Căn hộ cần ít nhất một hình thức: cho thuê hoặc bán.');
    return { typeId, projectName };
  }

  /**
   * Unit code when the editor leaves it empty: "DVG-" and the last 4
   * characters of the id (more of them if another unit already uses it).
   */
  private async autoUnitCode(tx: Prisma.TransactionClient, id: string) {
    const hex = id.replace(/-/g, '').toUpperCase();
    for (const length of [4, 6, 8]) {
      const code = `DVG-${hex.slice(-length)}`;
      if (!(await tx.property.findFirst({ where: { unitCode: code }, select: { id: true } }))) return code;
    }
    return `DVG-${hex}`;
  }

  /**
   * A free slug from `base` (the typed slug or the unit name). When another
   * unit has it, the unit code is added ("can-2pn-view-song-a-12-05"), then
   * a number.
   */
  private async freeSlug(tx: Prisma.TransactionClient, base: string, unitCode: string, selfId?: string) {
    const taken = async (slug: string) => {
      const row = await tx.property.findUnique({ where: { slug }, select: { id: true } });
      return !!row && row.id !== selfId;
    };
    const root = slugify(base).slice(0, 120).replace(/-+$/, '') || 'can-ho';
    if (!(await taken(root))) return root;
    const withCode = `${root}-${slugify(unitCode)}`.slice(0, 150).replace(/-+$/, '');
    if (!(await taken(withCode))) return withCode;
    for (let n = 2; ; n++) if (!(await taken(`${withCode}-${n}`))) return `${withCode}-${n}`;
  }

  private scalars(dto: UpdatePropertyDto) {
    return {
      unitCode: dto.unitCode,
      forRent: dto.forRent,
      forSale: dto.forSale,
      isConsignment: dto.isConsignment,
      availability: dto.availability,
      isDemo: dto.isDemo,
      address: dto.address,
      floor: dto.floor,
      direction: dto.direction,
      furnishing: dto.furnishing,
      rentPriceVnd: dto.rentPriceVnd === undefined ? undefined : toBigInt(dto.rentPriceVnd),
      salePriceVnd: dto.salePriceVnd === undefined ? undefined : toBigInt(dto.salePriceVnd),
      depositVnd: dto.depositVnd === undefined ? undefined : toBigInt(dto.depositVnd),
      managementFeeVnd: dto.managementFeeVnd === undefined ? undefined : toBigInt(dto.managementFeeVnd),
      minimumLeaseMonths: dto.minimumLeaseMonths,
      availableFrom: date(dto.availableFrom),
      contactName: dto.contactName,
      contactPhone: dto.contactPhone,
      rentalPolicy: dto.rentalPolicy,
      coverImageId: dto.coverImageId,
      coverImageAlt: dto.coverImageAlt,
      videoUrl: dto.videoUrl,
      seoTitle: dto.seoTitle,
      seoDescription: dto.seoDescription,
      highlight: dto.highlight,
    };
  }

  private async relations(tx: Prisma.TransactionClient, propertyId: string, dto: UpdatePropertyDto) {
    // Gallery may mix images and videos; the cover must be an image.
    const media = [...new Set([...(dto.galleryImageIds ?? []), ...(dto.coverImageId ? [dto.coverImageId] : [])])];
    const found = media.length
      ? await tx.mediaAsset.findMany({ where: { id: { in: media } }, select: { id: true, mimeType: true } })
      : [];
    if (found.length !== media.length) throw badRequest('Ảnh hoặc video đã chọn không còn tồn tại.');
    if (dto.coverImageId && !found.find((m) => m.id === dto.coverImageId)?.mimeType.startsWith('image/'))
      throw badRequest('Ảnh bìa phải là ảnh, không phải video.');
    if (dto.galleryImageIds) {
      await tx.propertyImage.deleteMany({ where: { propertyId } });
      await tx.propertyImage.createMany({ data: dto.galleryImageIds.map((mediaId, sortOrder) => ({ propertyId, mediaId, sortOrder })) });
    }
    if (dto.amenities) {
      await tx.propertyAmenity.deleteMany({ where: { propertyId } });
      await tx.propertyAmenity.createMany({ data: dto.amenities.map((name, sortOrder) => ({ propertyId, name, sortOrder })) });
    }
  }
}

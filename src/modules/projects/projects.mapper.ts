import type { Prisma } from '../../generated/prisma/client.js';
import { image } from '../../common/utils/content.js';
import { decimal, isoDate } from '../../common/utils/serialize.js';

export const projectInclude = {
  coverImage: true,
  categories: { include: { category: true }, orderBy: { category: { sortOrder: 'asc' } } },
  images: { include: { media: true }, orderBy: { sortOrder: 'asc' } },
  amenities: { orderBy: { sortOrder: 'asc' } },
  highlights: { orderBy: { sortOrder: 'asc' } },
} as const satisfies Prisma.ProjectInclude;
export type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

export function toPublicProject(p: ProjectRow) {
  const alt = p.coverImageAlt || `${p.imageCredit || 'Hình ảnh'} ${p.name}`;
  return {
    id: p.id,
    slug: p.slug,
    legacyKey: p.legacyKey,
    name: p.name,
    stage: p.stage,
    categories: p.categories.map((c) => c.category.code),
    propertyKind: p.propertyKind,
    location: p.location,
    address: p.address,
    intro: p.intro,
    overview: p.overview,
    products: p.products,
    developer: p.developer,
    companyRole: p.companyRole,
    legalStatus: p.legalStatus,
    totalAreaM2: decimal(p.totalAreaM2),
    totalUnits: p.totalUnits,
    startDate: isoDate(p.startDate),
    handoverDate: isoDate(p.handoverDate),
    map:
      p.mapUrl || p.latitude
        ? {
            url: p.mapUrl,
            label: p.mapLabel,
            lat: decimal(p.latitude),
            lng: decimal(p.longitude),
          }
        : null,
    coverImage: image(p.coverImage, alt),
    imageCredit: p.imageCredit,
    sourceUrl: p.sourceUrl,
    gallery: p.images.map((i) => image(i.media, i.caption || `${p.name} ${i.sortOrder + 1}`)!),
    amenities: p.amenities.map((a) => a.name),
    highlights: p.highlights.map((h) => ({ title: h.title, text: h.text })),
    rentalGuide: p.rentalIntro
      ? { intro: p.rentalIntro, focus: p.rentalFocus, checks: p.rentalChecks }
      : null,
    seo: { title: p.seoTitle, description: p.seoDescription },
    publishedAt: p.publishedAt,
    updatedAt: p.updatedAt,
  };
}

export function toAdminProject(
  p: ProjectRow & { _count?: { properties: number } },
) {
  return {
    ...toPublicProject(p),
    status: p.status,
    sortOrder: p.sortOrder,
    coverImageId: p.coverImageId,
    coverImageAlt: p.coverImageAlt,
    mapUrl: p.mapUrl,
    mapLabel: p.mapLabel,
    latitude: decimal(p.latitude),
    longitude: decimal(p.longitude),
    rentalIntro: p.rentalIntro,
    rentalFocus: p.rentalFocus,
    rentalChecks: p.rentalChecks,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    galleryImageIds: p.images.map((i) => i.mediaId),
    deletedAt: p.deletedAt,
    createdAt: p.createdAt,
    propertyCount: p._count?.properties ?? 0,
  };
}

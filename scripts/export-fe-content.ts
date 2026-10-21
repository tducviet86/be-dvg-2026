/**
 * One-off (already run): snapshots the content that FE-DVG used to hard-code
 * into prisma/data/*.json. The mock files were removed from FE-DVG after the
 * migration, so re-running requires a checkout of FE-DVG commit 380a2b8:
 *   git -C ../FE-DVG worktree add /tmp/fe-legacy 380a2b8
 *   npx tsx scripts/export-fe-content.ts /tmp/fe-legacy
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const fe = resolve(process.argv[2] ?? '../FE-DVG');
const load = (file: string) => import(pathToFileURL(resolve(fe, file)).href);

const { homeProjects, projectStories } = await load('src/data/home-projects.ts');
const { projectLocations } = await load('src/data/project-locations.ts');
const { rentalGuides } = await load('src/data/rental-content.ts');
const { staticPages } = await load('src/lib/pages.ts');
const data = await load('src/data/index.ts');

type Home = { id: string; slug: string; projectId: string; name: string; group: string; location: string; imageType: string; source: string };

const projects = (homeProjects as Home[]).map((h, index) => {
  const story = projectStories[h.id];
  const map = projectLocations[h.projectId];
  const guide = rentalGuides[h.slug];
  return {
    legacyKey: h.id,
    legacyId: h.projectId,
    slug: h.slug,
    name: h.name,
    categories: h.group === 'development' ? ['development', 'sale'] : ['operation', 'rent', 'sale'],
    stage: h.group === 'development' ? 'UNDER_DEVELOPMENT' : 'OPERATING',
    sortOrder: index + 1, // homepage display order
    propertyKind: 'Căn hộ & bất động sản',
    location: h.location,
    intro: story.intro,
    overview: story.paragraphs,
    products: story.products,
    highlights: story.highlights,
    imageCredit: h.imageType,
    sourceUrl: h.source,
    coverImage: `/images/projects/${h.id}.jpg`,
    map: map ? { url: map.url, label: map.label, lat: map.lat, lng: map.lng } : null,
    rentalGuide: guide ?? null,
    provenance: {
      identity: 'public information with source URL (FE home-projects.ts) — needs business confirmation',
      text: 'editorial copy written for the demo — needs business review',
      map: map ? 'Google Maps links supplied by the company (FE project-locations.ts)' : null,
      image: 'downloaded from the developer website (FE reports/project-image-sources.json) — usage rights to confirm',
    },
  };
});

const pages = Object.entries(staticPages as Record<string, { title: string; eyebrow: string; intro: string; sections: [string, string][] }>).map(([path, p]) => ({
  path,
  title: p.title,
  eyebrow: p.eyebrow,
  intro: p.intro,
  sections: p.sections.map(([heading, body]) => ({ heading, body })),
}));

const banners = (data.banners as { title: string; label: string; description: string; imageUrl: string; imageAlt: string; sortOrder: number }[]).map((b) => ({
  label: b.label,
  title: b.title,
  description: b.description,
  imageUrl: b.imageUrl,
  imageAlt: b.imageAlt,
  sortOrder: b.sortOrder,
}));

const projectSlugById = Object.fromEntries((homeProjects as Home[]).map((h) => [h.projectId, h.slug]));
const typeCode: Record<string, string> = { Studio: 'studio', '1 phòng ngủ': '1pn', '2 phòng ngủ': '2pn', 'Căn hộ dịch vụ': 'serviced', Penthouse: 'penthouse' };
const furnishing: Record<string, string> = { 'Đầy đủ nội thất': 'FULL', 'Nội thất cơ bản': 'BASIC', 'Không nội thất': 'NONE' };
const availability: Record<string, string> = { 'Còn trống': 'AVAILABLE', 'Đã cho thuê': 'RENTED', 'Đang bảo trì': 'MAINTENANCE' };
const demoProperties = (data.properties as Record<string, any>[]).map((p) => ({
  slug: p.slug,
  name: p.name,
  projectSlug: projectSlugById[p.projectId],
  propertyType: typeCode[p.type],
  location: p.location,
  areaM2: p.area,
  bedrooms: p.bedrooms,
  bathrooms: p.bathrooms,
  floor: p.floor,
  furnishing: furnishing[p.furniture],
  availability: availability[p.status],
  rentPriceVnd: String(Math.round(p.price * 1_000_000)),
  description: p.description,
  images: [...new Set([p.image, ...String(p.gallery ?? '').split('\n')].filter(Boolean))],
  videoUrl: p.videoUrl ?? null,
}));
const demoPosts = (data.posts as Record<string, any>[]).map((p) => ({
  slug: p.slug,
  title: p.name,
  excerpt: p.description,
  category: p.categorySlug,
  categoryName: p.category,
  readingMinutes: p.readingTime,
  image: p.image,
  publishedAt: p.createdAt,
}));

const out = (name: string, value: unknown) =>
  writeFileSync(resolve('prisma/data', name), JSON.stringify(value, null, 2) + '\n');
out('legacy-content.json', {
  exportedAt: new Date().toISOString(),
  source: 'FE-DVG src/data + src/lib/pages.ts',
  classification: 'existing site content — imported as DRAFT unless --publish; see docs/DATA-MIGRATION.md',
  projects,
  pages,
  banners,
});
out('demo-content.json', {
  exportedAt: new Date().toISOString(),
  classification: 'DEMO ONLY — never import into production',
  properties: demoProperties,
  posts: demoPosts,
});
console.log(`projects=${projects.length} pages=${pages.length} banners=${banners.length} demoProperties=${demoProperties.length} demoPosts=${demoPosts.length}`);

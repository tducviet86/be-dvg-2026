/**
 * Imports the content that FE-DVG used to hard-code (prisma/data/legacy-content.json).
 *
 *   npm run import:legacy               # creates missing records as DRAFT
 *   npm run import:legacy -- --publish  # also publishes them (after business review)
 *
 * Existing records (matched by slug/path) are never overwritten, so the
 * script is safe to re-run after editors changed content in the CMS.
 * Images stay EXTERNAL (served by the frontend under /images); upload them
 * to object storage through the CMS before go-live.
 */
import { readFileSync } from 'node:fs';
import { prisma } from './db.js';

const publish = process.argv.includes('--publish');
const content = JSON.parse(readFileSync(new URL('../prisma/data/legacy-content.json', import.meta.url), 'utf8'));
const now = new Date();
const status = publish ? ('PUBLISHED' as const) : ('DRAFT' as const);
const publishedAt = publish ? now : null;

async function media(url: string, alt: string) {
  return prisma.mediaAsset.upsert({
    where: { key: url },
    create: { storage: 'EXTERNAL', key: url, url, mimeType: url.endsWith('.png') ? 'image/png' : 'image/jpeg', alt },
    update: {},
  });
}

let created = 0;
let skipped = 0;
const categories = Object.fromEntries((await prisma.projectCategory.findMany()).map((c) => [c.code, c.id]));
if (!Object.keys(categories).length) throw new Error('Run `npm run db:seed` first.');

for (const p of content.projects) {
  if (await prisma.project.findUnique({ where: { slug: p.slug } })) {
    skipped++;
    continue;
  }
  const cover = await media(p.coverImage, `${p.imageCredit} ${p.name}`);
  await prisma.project.create({
    data: {
      slug: p.slug,
      legacyKey: p.legacyKey,
      name: p.name,
      stage: p.stage,
      status,
      publishedAt,
      propertyKind: p.propertyKind,
      location: p.location,
      intro: p.intro,
      overview: p.overview,
      products: p.products,
      imageCredit: p.imageCredit,
      sourceUrl: p.sourceUrl,
      coverImageId: cover.id,
      coverImageAlt: `${p.imageCredit} ${p.name}`,
      mapUrl: p.map?.url,
      mapLabel: p.map?.label,
      latitude: p.map?.lat,
      longitude: p.map?.lng,
      rentalIntro: p.rentalGuide?.intro,
      rentalFocus: p.rentalGuide?.focus,
      rentalChecks: p.rentalGuide?.checks ?? [],
      sortOrder: p.sortOrder,
      categories: { create: p.categories.map((code: string) => ({ categoryId: categories[code] })) },
      highlights: { create: p.highlights.map((h: { title: string; text: string }, i: number) => ({ ...h, sortOrder: i })) },
    },
  });
  created++;
}

for (const page of content.pages) {
  if (await prisma.staticPage.findUnique({ where: { path: page.path } })) {
    skipped++;
    continue;
  }
  await prisma.staticPage.create({ data: { ...page, status, publishedAt } });
  created++;
}

if (!(await prisma.banner.count())) {
  for (const b of content.banners) {
    const image = await media(b.imageUrl, b.imageAlt);
    await prisma.banner.create({
      data: { type: 'NORMAL', label: b.label, title: b.title, description: b.description, imageId: image.id, imageAlt: b.imageAlt, sortOrder: b.sortOrder, isActive: true },
    });
    created++;
  }
} else skipped += content.banners.length;

await prisma.auditLog.create({ data: { action: 'import.legacy', changes: { created, skipped, publish } } });
console.log(`Legacy import: ${created} created, ${skipped} skipped (existing), status=${status}.`);
await prisma.$disconnect();

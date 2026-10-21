/**
 * DEMO DATA — development/staging previews only. Refuses to run in production.
 * Units and posts are flagged isDemo: the website labels them, marks them
 * noindex and keeps them out of the sitemap.
 */
import { readFileSync } from 'node:fs';
import { normalize } from '../src/common/utils/text.js';
import { isProduction, prisma } from './db.js';

if (isProduction || process.env.ALLOW_DEMO_SEED === 'false') throw new Error('Demo seed is disabled in production.');
const demo = JSON.parse(readFileSync(new URL('../prisma/data/demo-content.json', import.meta.url), 'utf8'));
const now = new Date();

async function media(url: string) {
  return prisma.mediaAsset.upsert({
    where: { key: url },
    create: { storage: 'EXTERNAL', key: url, url, mimeType: url.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg' },
    update: {},
  });
}
const types = Object.fromEntries((await prisma.propertyType.findMany()).map((t) => [t.code, t.id]));
let count = 0;
for (const [index, p] of demo.properties.entries()) {
  const project = await prisma.project.findUnique({ where: { slug: p.projectSlug } });
  if (!project || (await prisma.property.findUnique({ where: { slug: p.slug } }))) continue;
  const images = await Promise.all(p.images.map((url: string) => media(url)));
  await prisma.property.create({
    data: {
      slug: p.slug,
      name: p.name,
      projectId: project.id,
      propertyTypeId: types[p.propertyType],
      isDemo: true,
      status: 'PUBLISHED',
      publishedAt: now,
      // Distinct timestamps keep the listing order of the original data.
      createdAt: new Date(now.getTime() + index * 1000),
      forRent: true,
      availability: p.availability,
      location: p.location,
      areaM2: p.areaM2,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      floor: p.floor,
      furnishing: p.furnishing,
      rentPriceVnd: BigInt(p.rentPriceVnd),
      description: p.description,
      searchText: normalize(`${p.name} ${p.location} ${project.name}`),
      coverImageId: images[0].id,
      videoUrl: p.videoUrl,
      images: { create: images.map((m, i) => ({ mediaId: m.id, sortOrder: i })) },
    },
  });
  count++;
}
const categories = Object.fromEntries((await prisma.blogCategory.findMany()).map((c) => [c.slug, c.id]));
for (const post of demo.posts) {
  if (await prisma.blogPost.findUnique({ where: { slug: post.slug } })) continue;
  const cover = await media(post.image);
  await prisma.blogPost.create({
    data: {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: `${post.excerpt}\n\nNội dung minh họa cho bản xem trước. Bài viết chính thức sẽ được biên tập bởi Đất Vàng Group.`,
      categoryId: categories[post.category],
      readingMinutes: post.readingMinutes,
      status: 'PUBLISHED',
      publishedAt: new Date(`${post.publishedAt}T08:00:00+07:00`),
      isDemo: true,
      coverImageId: cover.id,
    },
  });
  count++;
}
console.log(`Demo seed: ${count} records created (isDemo=true).`);
await prisma.$disconnect();

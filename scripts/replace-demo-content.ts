/**
 * Replaces what is left of the demo site with the company content
 * (prisma/data/company-content.ts):
 *   • a company page or "Lĩnh vực hoạt động" page whose text still mentions
 *     the demo gets the real text (pages already edited in Admin are kept);
 *   • sample blog posts (isDemo) are archived, as Admin › Xóa would.
 *
 *   npm run content:real            # apply
 *   npm run content:real -- --dry   # only list what would change
 *
 * Safe to run on every deploy: once replaced, nothing matches any more.
 */
import { prisma } from './db.js';
import { COMPANY_PAGES, DEMO_MARKERS, SERVICE_SECTIONS } from '../prisma/data/company-content.js';

const dry = process.argv.includes('--dry');
const changed: string[] = [];
const kept: string[] = [];

const hasDemo = (page: { title: string; eyebrow: string | null; intro: string | null; summary?: string | null; sections: unknown }) =>
  DEMO_MARKERS.test([page.title, page.eyebrow, page.intro, page.summary, JSON.stringify(page.sections)].join(' '));

for (const content of COMPANY_PAGES) {
  const page = await prisma.staticPage.findUnique({ where: { path: content.path } });
  if (!page) continue;
  if (!hasDemo(page)) {
    kept.push(content.path);
    continue;
  }
  changed.push(`trang /${content.path}`);
  if (!dry)
    await prisma.staticPage.update({
      where: { id: page.id },
      data: { eyebrow: content.eyebrow, title: content.title, intro: content.intro, sections: content.sections },
    });
}

for (const [slug, sections] of Object.entries(SERVICE_SECTIONS)) {
  const page = await prisma.staticPage.findUnique({ where: { path: `dich-vu/${slug}` } });
  if (!page) continue;
  if (!hasDemo(page)) {
    kept.push(`dich-vu/${slug}`);
    continue;
  }
  changed.push(`lĩnh vực /dich-vu/${slug}`);
  if (!dry) await prisma.staticPage.update({ where: { id: page.id }, data: { sections } });
}

const samples = await prisma.blogPost.findMany({ where: { isDemo: true, deletedAt: null }, select: { id: true, slug: true } });
for (const post of samples) changed.push(`bài mẫu /blog/${post.slug}`);
if (!dry && samples.length)
  await prisma.blogPost.updateMany({
    where: { id: { in: samples.map((p) => p.id) } },
    data: { deletedAt: new Date(), status: 'ARCHIVED' },
  });

if (!dry && changed.length)
  await prisma.auditLog.create({ data: { action: 'content.replace_demo', entityType: 'page', changes: { changed } } });

console.log(`${dry ? '[Thử] ' : ''}Đã thay ${changed.length} mục nội dung demo.`);
for (const line of changed) console.log(`  • ${line}`);
if (kept.length) console.log(`Giữ nguyên (không còn chữ demo): ${kept.join(', ')}`);
await prisma.$disconnect();

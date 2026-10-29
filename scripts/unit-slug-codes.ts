/**
 * Gives units saved before slugs carried the unit code a slug ending with it
 * ("can-ho-2-phong-ngu" → "can-ho-2-phong-ngu-mb033"), as saving in Admin
 * would; a unit without a code gets one ("DVG-…"). The old link keeps
 * working: it redirects to the new one.
 *
 *   npm run units:codes            # apply
 *   npm run units:codes -- --dry   # only list what would change
 *
 * Safe to run on every deploy: once renamed, nothing matches any more.
 */
import { prisma } from './db.js';
import { slugify, unitSlug } from '../src/common/utils/text.js';

const dry = process.argv.includes('--dry');
const changed: string[] = [];

const taken = async (slug: string, selfId: string) => {
  const row = await prisma.property.findUnique({ where: { slug }, select: { id: true } });
  return !!row && row.id !== selfId;
};
const freeCode = async (id: string) => {
  const hex = id.replace(/-/g, '').toUpperCase();
  for (const length of [4, 6, 8]) {
    const code = `DVG-${hex.slice(-length)}`;
    if (!(await prisma.property.findFirst({ where: { unitCode: code }, select: { id: true } }))) return code;
  }
  return `DVG-${hex}`;
};

const units = await prisma.property.findMany({ where: { deletedAt: null }, select: { id: true, slug: true, unitCode: true } });
for (const unit of units) {
  const code = unit.unitCode?.trim() || (await freeCode(unit.id));
  const suffix = slugify(code);
  // Already ends with the code, also with a number after it ("…-mb033-2").
  if (suffix && new RegExp(`(^|-)${suffix}(-\\d+)?$`).test(unit.slug)) continue;
  let slug = unitSlug(unit.slug, code);
  for (let n = 2; await taken(slug, unit.id); n++) slug = `${unitSlug(unit.slug, code)}-${n}`;
  if (slug === unit.slug) continue;
  changed.push(`/cho-thue/${unit.slug} → /cho-thue/${slug}`);
  if (dry) continue;
  await prisma.$transaction(async (tx) => {
    await tx.property.update({ where: { id: unit.id }, data: { slug, unitCode: code } });
    await tx.slugRedirect.deleteMany({ where: { entityType: 'PROPERTY', fromSlug: slug } });
    await tx.slugRedirect.upsert({
      where: { entityType_fromSlug: { entityType: 'PROPERTY', fromSlug: unit.slug } },
      create: { entityType: 'PROPERTY', fromSlug: unit.slug, entityId: unit.id },
      update: { entityId: unit.id },
    });
    await tx.auditLog.create({
      data: { action: 'property.slug_code', entityType: 'property', entityId: unit.id, changes: { from: unit.slug, slug, unitCode: code } },
    });
  });
}

// Tell the website to drop its cached pages, as saving in Admin does.
if (!dry && changed.length) {
  const url = process.env.FRONTEND_REVALIDATE_URL || 'http://web:3000/api/revalidate';
  const secret = process.env.REVALIDATE_SECRET;
  if (secret)
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags: ['properties', 'projects'] }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => console.log('Chưa báo được website làm mới; trang tự cập nhật sau ít phút.'));
}

console.log(`${dry ? '[Thử] ' : ''}Đã thêm mã căn vào đường dẫn của ${changed.length} căn.`);
for (const line of changed) console.log(`  • ${line}`);
await prisma.$disconnect();

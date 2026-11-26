/**
 * Photos and videos of owners' units stored under the real unit code or a
 * slug with the floor ("can-ho/1905/1905-….webp", "can-ho/can-2pn-tang-12-…/")
 * give the unit away in their address. This copies each one to a folder
 * named by the unit's public code ("can-ho/sp-31284/sp-31284-….webp"),
 * points the media library and the unit's texts at the new address, then
 * deletes the old file. Model units (with a floor note) keep their files.
 *
 *   npm run units:public-media             # only list what would change
 *   npm run units:public-media -- --apply  # copy, update, delete
 *
 * Safe to run again: renamed files no longer match.
 */
import 'dotenv/config';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CopyObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { prisma } from './db.js';
import { slugify } from '../src/common/utils/text.js';
import { isModelUnit, maskable, publicCode } from '../src/modules/properties/public-unit.js';

const apply = process.argv.includes('--apply');
const env = process.env;
const s3 =
  env.STORAGE_DRIVER === 's3'
    ? new S3Client({
        region: env.S3_REGION || 'auto',
        endpoint: env.S3_ENDPOINT,
        forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
        credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
      })
    : null;
const localDir = env.LOCAL_MEDIA_DIR || './.local/media';
const base = (env.MEDIA_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');

async function move(from: string, to: string) {
  if (s3) {
    await s3.send(new CopyObjectCommand({ Bucket: env.S3_BUCKET, CopySource: `${env.S3_BUCKET}/${encodeURI(from)}`, Key: to }));
    return () => s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: from }));
  }
  await mkdir(dirname(join(localDir, to)), { recursive: true });
  await copyFile(join(localDir, from), join(localDir, to));
  return () => rm(join(localDir, from), { force: true });
}

const units = await prisma.property.findMany({
  where: { deletedAt: null },
  select: {
    id: true,
    unitCode: true,
    floor: true,
    floorNote: true,
    tower: true,
    publicNumber: true,
    description: true,
    coverImage: true,
    images: { select: { media: true } },
    project: { select: { codePrefix: true, towers: true } },
  },
});
const plan: { id: string; key: string; url: string; to: string; unitId: string }[] = [];
for (const unit of units) {
  if (isModelUnit(unit)) continue;
  const code = publicCode(unit);
  if (!code) continue;
  const folder = slugify(code);
  const real = maskable(unit.unitCode) ? slugify(unit.unitCode) : '';
  const leaks = (key: string) =>
    (real && new RegExp(`(^|[/-])${real}(?=[/-]|$)`).test(key)) || /(^|[/-])(tang|lau)-\d{1,2}[ab]?(?=[/-]|$)/.test(key);
  for (const media of [unit.coverImage, ...unit.images.map((i) => i.media)]) {
    if (!media || !media.key.startsWith('can-ho/') || !leaks(media.key) || plan.some((p) => p.id === media.id)) continue;
    // Keep the end of the name (date, random part, extension).
    const tail = media.key.split('/').pop()!.replace(/^.*?(-\d{8}-[0-9a-f]{8}\.\w+)$/, '$1');
    const name = tail.startsWith('-') ? `${folder}${tail}` : `${folder}-${tail}`;
    plan.push({ id: media.id, key: media.key, url: media.url, to: `can-ho/${folder}/${name}`, unitId: unit.id });
  }
}

for (const p of plan) console.log(`${p.key} → ${p.to}`);
console.log(`\n${plan.length} tệp ${apply ? 'đã đổi tên' : 'sẽ đổi tên (chạy thêm --apply để làm)'}.`);
if (apply)
  for (const p of plan) {
    const removeOld = await move(p.key, p.to);
    const url = base ? `${base}/${p.to}` : p.url.replace(p.key, p.to);
    await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.update({ where: { id: p.id }, data: { key: p.to, url } });
      // Photos placed in a unit's text keep working.
      await tx.$executeRaw`UPDATE "properties" SET "description" = replace("description", ${p.url}, ${url}) WHERE strpos("description", ${p.url}) > 0`;
      await tx.auditLog.create({ data: { action: 'media.public_key', entityType: 'media', entityId: p.id, changes: { from: p.key, to: p.to } } });
    });
    await removeOld();
  }
// Tell the website to drop its cached pages, as saving in Admin does.
if (apply && plan.length && env.REVALIDATE_SECRET)
  await fetch(env.FRONTEND_REVALIDATE_URL || 'http://web:3000/api/revalidate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-revalidate-secret': env.REVALIDATE_SECRET },
    body: JSON.stringify({ tags: ['properties', 'projects'] }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => console.log('Chưa báo được website làm mới; trang tự cập nhật sau ít phút.'));
await prisma.$disconnect();

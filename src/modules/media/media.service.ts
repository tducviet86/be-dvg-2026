import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppConfig } from '../../config/config.service.js';
import { AppError, conflict, notFound } from '../../common/errors.js';
import { plainText } from '../../common/utils/text.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService } from './storage.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
// QuickTime (.mov, e.g. iPhone) shares the MP4 container and is served as MP4.
const VIDEO = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_DIMENSION = 2560;

export type MediaOwner = 'property' | 'project' | 'post' | 'banner';
const FOLDER: Record<MediaOwner, string> = { property: 'can-ho', project: 'du-an', post: 'bai-viet', banner: 'banner' };

/** "Căn MB 029/A" → "Can-MB-029-A": safe in URLs and file systems, case kept. */
const safeCode = (code = '') =>
  code
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export function mediaKey(place: { owner?: MediaOwner; code?: string }, ext: string, now = new Date()) {
  const code = safeCode(place.code);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (place.owner && code) {
    const day = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
    return `${FOLDER[place.owner]}/${code}/${code}-${day}-${randomUUID().slice(0, 8)}.${ext}`;
  }
  return `uploads/${now.getUTCFullYear()}/${pad(now.getUTCMonth() + 1)}/${randomUUID()}.${ext}`;
}

export type MediaUsage = { projects: number; properties: number; banners: number; posts: number; pages: number; other: number };
const USAGE_KEYS = ['projects', 'properties', 'banners', 'posts', 'pages', 'other'] as const;
export type MediaListQuery = {
  page: number;
  pageSize: number;
  type?: 'image' | 'video';
  usage?: 'used' | 'unused';
  q?: string;
  sort?: 'newest' | 'oldest' | 'largest';
};
const ORDER = { newest: 'created_at DESC', oldest: 'created_at ASC', largest: 'size_bytes DESC, created_at DESC' } as const;

/**
 * How many times each asset is used. Covers and galleries point at the
 * asset's id; files pasted into text (photos inside an article or page,
 * unit videos, settings) are found by their storage key in that text. A key
 * containing "_" may match a little more than itself: that only ever keeps
 * a file, never deletes one in use.
 */
const usageSelect = (where: Prisma.Sql) => Prisma.sql`
  SELECT m.id, m.created_at, m.size_bytes,
    (SELECT count(*) FROM projects p WHERE p.cover_image_id = m.id)
      + (SELECT count(*) FROM project_images i WHERE i.media_id = m.id) AS projects,
    (SELECT count(*) FROM properties p WHERE p.cover_image_id = m.id
        OR p.video_url LIKE '%' || m.key || '%' OR p.description LIKE '%' || m.key || '%')
      + (SELECT count(*) FROM property_images i WHERE i.media_id = m.id) AS properties,
    (SELECT count(*) FROM banners b WHERE b.image_id = m.id OR b.mobile_image_id = m.id
        OR b.description LIKE '%' || m.key || '%') AS banners,
    (SELECT count(*) FROM blog_posts b WHERE b.cover_image_id = m.id OR b.content LIKE '%' || m.key || '%') AS posts,
    (SELECT count(*) FROM static_pages s WHERE s.cover_image_id = m.id OR s.sections::text LIKE '%' || m.key || '%') AS pages,
    (SELECT count(*) FROM site_settings s WHERE s.value::text LIKE '%' || m.key || '%')
      + (SELECT count(*) FROM job_postings j WHERE j.description LIKE '%' || m.key || '%') AS other
  FROM media_assets m WHERE ${where}`;
const USED = Prisma.sql`(projects + properties + banners + posts + pages + other) > 0`;
type UsageRow = { id: string } & Record<(typeof USAGE_KEYS)[number], bigint | number>;
const toUsage = (row?: UsageRow): MediaUsage =>
  Object.fromEntries(USAGE_KEYS.map((k) => [k, Number(row?.[k] ?? 0)])) as MediaUsage;
const isUsed = (usage: MediaUsage) => Object.values(usage).some(Boolean);

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Validates the real file signature (never the client MIME type or
   * extension). Images are re-encoded to WebP — which strips EXIF/GPS
   * metadata and any payload appended to the file. MP4/WebM videos are
   * stored as uploaded (bounded by MAX_VIDEO_MB). Keys name the record the
   * file was uploaded for (can-ho/MB029/MB029-20261022-3f2a9c.webp), so a
   * backup is easy to browse; without one they fall back to uploads/YYYY/MM.
   */
  async upload(
    file: Express.Multer.File | undefined,
    alt: string | undefined,
    actorId: string,
    place: { owner?: MediaOwner; code?: string } = {},
  ) {
    if (!file?.buffer?.length)
      throw new AppError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'Chưa chọn tệp.');
    const detected = await fileTypeFromBuffer(file.buffer);
    const isVideo = !!detected && VIDEO.has(detected.mime);
    if (!detected || (!isVideo && !ALLOWED.has(detected.mime)))
      throw new AppError(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'UNSUPPORTED_MEDIA',
        'Chỉ hỗ trợ ảnh JPG, PNG, WebP, AVIF hoặc video MP4, MOV, WebM.',
      );
    const limitMb = this.config.get(isVideo ? 'MAX_VIDEO_MB' : 'MAX_UPLOAD_MB');
    if (file.buffer.length > limitMb * 1024 * 1024)
      throw new AppError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'PAYLOAD_TOO_LARGE',
        `${isVideo ? 'Video' : 'Ảnh'} vượt quá dung lượng cho phép (${limitMb} MB).`,
      );
    let data: Buffer;
    let width: number | null = null;
    let height: number | null = null;
    let mimeType: string;
    let ext: string;
    if (isVideo) {
      data = file.buffer;
      const quicktime = detected.mime === 'video/quicktime';
      mimeType = quicktime ? 'video/mp4' : detected.mime;
      ext = quicktime ? 'mp4' : detected.ext;
    } else {
      try {
        const output = await sharp(file.buffer, { limitInputPixels: 80_000_000 })
          .rotate()
          .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
        data = output.data;
        width = output.info.width;
        height = output.info.height;
      } catch {
        throw new AppError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_MEDIA', 'Tệp ảnh bị lỗi hoặc không đọc được.');
      }
      mimeType = 'image/webp';
      ext = 'webp';
    }
    const key = mediaKey(place, ext);
    await this.storage.driver.put(key, data, mimeType);
    const asset = await this.prisma.mediaAsset.create({
      data: {
        storage: this.storage.driver.kind,
        key,
        url: this.storage.driver.publicUrl(key),
        mimeType,
        sizeBytes: data.length,
        width,
        height,
        alt: alt ? plainText(alt).slice(0, 300) || null : null,
        checksum: createHash('sha256').update(data).digest('hex'),
        createdById: actorId,
      },
    });
    await this.audit.log({ actorId, action: 'media.upload', entityType: 'media', entityId: asset.id, changes: { originalName: file.originalname?.slice(0, 200), bytes: file.size, mimeType } });
    return asset;
  }

  /** Admin library: files with where they are used, filtered and sorted. */
  async list(q: MediaListQuery) {
    const filters = [Prisma.sql`TRUE`];
    if (q.type) filters.push(Prisma.sql`m.mime_type LIKE ${`${q.type}/%`}`);
    if (q.q) {
      const like = `%${q.q.replace(/[\\%_]/g, '\\$&')}%`;
      filters.push(Prisma.sql`(m.key ILIKE ${like} OR m.alt ILIKE ${like})`);
    }
    const base = usageSelect(Prisma.join(filters, ' AND '));
    const having = q.usage === 'used' ? USED : q.usage === 'unused' ? Prisma.sql`NOT ${USED}` : Prisma.sql`TRUE`;
    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<UsageRow[]>`
        WITH u AS (${base}) SELECT * FROM u WHERE ${having}
        ORDER BY ${Prisma.raw(ORDER[q.sort ?? 'newest'])} LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
      this.prisma.$queryRaw<{ total: bigint }[]>`WITH u AS (${base}) SELECT count(*) AS total FROM u WHERE ${having}`,
    ]);
    const assets = await this.prisma.mediaAsset.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
    const byId = new Map(assets.map((a) => [a.id, a]));
    const data = rows.flatMap((row) => {
      const asset = byId.get(row.id);
      if (!asset) return [];
      const usage = toUsage(row);
      return [{ ...asset, usage, used: isUsed(usage) }];
    });
    return { data, total: Number(total) };
  }

  /** Totals for the library header: everything, and what nothing uses. */
  async stats() {
    const [row] = await this.prisma.$queryRaw<{ total: bigint; bytes: bigint | null; videos: bigint; unused: bigint; unused_bytes: bigint | null }[]>`
      WITH u AS (${usageSelect(Prisma.sql`TRUE`)}), v AS (SELECT id FROM media_assets WHERE mime_type LIKE 'video/%')
      SELECT count(*) AS total, sum(size_bytes) AS bytes,
        (SELECT count(*) FROM v) AS videos,
        count(*) FILTER (WHERE NOT ${USED}) AS unused,
        sum(size_bytes) FILTER (WHERE NOT ${USED}) AS unused_bytes
      FROM u`;
    return {
      total: Number(row.total),
      bytes: Number(row.bytes ?? 0),
      videos: Number(row.videos),
      unused: Number(row.unused),
      unusedBytes: Number(row.unused_bytes ?? 0),
    };
  }

  async usage(id: string): Promise<MediaUsage> {
    const [row] = await this.prisma.$queryRaw<UsageRow[]>`${usageSelect(Prisma.sql`m.id = ${id}::uuid`)}`;
    return toUsage(row);
  }

  /** Where an asset is used, by name, so the editor can find it. */
  async places(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw notFound();
    const inText = { contains: asset.key };
    const [projects, properties, banners, posts, pages, settings, jobs] = await Promise.all([
      this.prisma.project.findMany({ where: { OR: [{ coverImageId: id }, { images: { some: { mediaId: id } } }] }, select: { id: true, name: true } }),
      this.prisma.property.findMany({
        where: { OR: [{ coverImageId: id }, { images: { some: { mediaId: id } } }, { videoUrl: inText }, { description: inText }] },
        select: { id: true, name: true },
      }),
      this.prisma.banner.findMany({ where: { OR: [{ imageId: id }, { mobileImageId: id }, { description: inText }] }, select: { id: true, title: true } }),
      this.prisma.blogPost.findMany({ where: { OR: [{ coverImageId: id }, { content: inText }] }, select: { id: true, title: true } }),
      this.prisma.$queryRaw<{ id: string; title: string }[]>`
        SELECT id, title FROM static_pages WHERE cover_image_id = ${id}::uuid OR sections::text LIKE ${`%${asset.key}%`}`,
      this.prisma.$queryRaw<{ key: string }[]>`SELECT key FROM site_settings WHERE value::text LIKE ${`%${asset.key}%`}`,
      this.prisma.jobPosting.findMany({ where: { description: inText }, select: { id: true, title: true } }),
    ]);
    return [
      ...projects.map((p) => ({ kind: 'projects', id: p.id, label: p.name })),
      ...properties.map((p) => ({ kind: 'properties', id: p.id, label: p.name })),
      ...banners.map((b) => ({ kind: 'banners', id: b.id, label: b.title })),
      ...posts.map((p) => ({ kind: 'posts', id: p.id, label: p.title })),
      ...pages.map((p) => ({ kind: 'pages', id: p.id, label: p.title })),
      ...settings.map((s) => ({ kind: 'settings', id: s.key, label: `Cài đặt: ${s.key}` })),
      ...jobs.map((j) => ({ kind: 'jobs', id: j.id, label: j.title })),
    ];
  }

  /**
   * Deletes the file (database row and stored object). Refuses media still
   * used anywhere, including photos pasted into an article or page.
   */
  async remove(id: string, actorId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw notFound();
    const usage = await this.usage(id);
    if (isUsed(usage)) throw conflict('Ảnh đang được sử dụng, hãy gỡ khỏi nội dung trước khi xóa.', usage);
    await this.prisma.mediaAsset.delete({ where: { id } });
    if (asset.storage !== 'EXTERNAL')
      // The row is gone either way; a file left behind only costs storage.
      await this.storage.driver.remove(asset.key).catch((err: unknown) => this.logger.warn({ err, key: asset.key }, 'stored file not removed'));
    await this.audit.log({ actorId, action: 'media.delete', entityType: 'media', entityId: id, changes: { key: asset.key, bytes: asset.sizeBytes } });
  }

  /** Deletes the unused files among `ids`; files in use are kept and listed. */
  async removeMany(ids: string[], actorId: string) {
    let deleted = 0;
    let bytes = 0;
    const kept: string[] = [];
    for (const id of new Set(ids)) {
      const asset = await this.prisma.mediaAsset.findUnique({ where: { id }, select: { sizeBytes: true } });
      if (!asset) continue;
      try {
        await this.remove(id, actorId);
        deleted++;
        bytes += asset.sizeBytes;
      } catch {
        kept.push(id);
      }
    }
    return { deleted, bytes, kept };
  }
}

import { HttpStatus, Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppConfig } from '../../config/config.service.js';
import { AppError, conflict, notFound } from '../../common/errors.js';
import { plainText } from '../../common/utils/text.js';
import { PrismaService } from '../../database/prisma.service.js';
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

@Injectable()
export class MediaService {
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

  async usage(id: string) {
    const [covers, gallery, propertyCovers, propertyImages, banners, posts] =
      await Promise.all([
        this.prisma.project.count({ where: { coverImageId: id } }),
        this.prisma.projectImage.count({ where: { mediaId: id } }),
        this.prisma.property.count({ where: { coverImageId: id } }),
        this.prisma.propertyImage.count({ where: { mediaId: id } }),
        this.prisma.banner.count({ where: { OR: [{ imageId: id }, { mobileImageId: id }] } }),
        this.prisma.blogPost.count({ where: { coverImageId: id } }),
      ]);
    return { projects: covers + gallery, properties: propertyCovers + propertyImages, banners, posts };
  }

  /** Refuses to delete media still referenced by any content. */
  async remove(id: string, actorId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw notFound();
    const usage = await this.usage(id);
    if (Object.values(usage).some(Boolean))
      throw conflict('Ảnh đang được sử dụng, hãy gỡ khỏi nội dung trước khi xóa.', usage);
    await this.prisma.mediaAsset.delete({ where: { id } });
    if (asset.storage !== 'EXTERNAL') await this.storage.driver.remove(asset.key);
    await this.audit.log({ actorId, action: 'media.delete', entityType: 'media', entityId: id, changes: { key: asset.key } });
  }
}

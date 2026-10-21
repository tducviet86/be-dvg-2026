import { stale } from '../errors.js';
import type { MediaAsset } from '../../generated/prisma/client.js';
import type { PublishStatus } from '../../generated/prisma/enums.js';

/** Visible to the public: published, not deleted, publish time reached. */
export const publishedWhere = () => ({
  status: 'PUBLISHED' as const,
  deletedAt: null,
  publishedAt: { lte: new Date() },
});

export type ImageDto = {
  id: string;
  url: string;
  mimeType: string;
  alt: string;
  width: number | null;
  height: number | null;
};
export const image = (
  media: MediaAsset | null | undefined,
  alt?: string | null,
): ImageDto | null =>
  media
    ? {
        id: media.id,
        url: media.url,
        mimeType: media.mimeType,
        alt: alt || media.alt || '',
        width: media.width,
        height: media.height,
      }
    : null;

/** First publication sets publishedAt; leaving PUBLISHED keeps history. */
export function publishFields(
  status: PublishStatus | undefined,
  current?: { status: PublishStatus; publishedAt: Date | null },
  requestedAt?: Date | null,
): { status?: PublishStatus; publishedAt?: Date } {
  if (!status) return {};
  if (status !== 'PUBLISHED') return { status };
  return {
    status,
    publishedAt:
      requestedAt ??
      (current?.status === 'PUBLISHED' && current.publishedAt
        ? current.publishedAt
        : current?.publishedAt && current.publishedAt > new Date()
          ? current.publishedAt
          : new Date()),
  };
}

/** Optimistic concurrency: reject writes based on an outdated read. */
export function assertFresh(updatedAt: Date, expected?: string) {
  if (expected && new Date(expected).getTime() !== updatedAt.getTime())
    throw stale();
}

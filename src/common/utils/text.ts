import sanitizeHtml from 'sanitize-html';

/** Lower-case, accent-free form used for slugs and search. */
export const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();

export const slugify = (value: string) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The CMS stores plain text (the frontend renders paragraphs, never HTML),
 * so every tag is stripped. This neutralises stored XSS regardless of how a
 * client renders the value.
 */
export const plainText = (value: string) =>
  sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

/** Strips tags from every string (deep) of a DTO-like value. */
export function cleanStrings<T>(value: T): T {
  if (typeof value === 'string') return plainText(value) as T;
  if (Array.isArray(value)) return value.map(cleanStrings) as T;
  if (value && typeof value === 'object' && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, cleanStrings(v)]),
    ) as T;
  return value;
}

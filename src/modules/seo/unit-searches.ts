import { normalize } from '../../common/utils/text.js';
import type { Listing } from '../ai/ai.service.js';

type Row = { query: string; impressions: number };

const RENT = /\b(thue|rent|rental|lease)\b/;
const SALE = /\b(ban|mua|sale|buy)\b/;
/** Words people use for each kind of unit (accent-free). */
const KIND_WORDS: Record<string, RegExp> = {
  apartment: /\b(can ho|chung cu|apartment|condo|studio|\d ?pn|phong ngu)\b/,
  shophouse: /\bshophouse\b/,
  townhouse: /\b(nha pho|nha nguyen can|townhouse|house)\b/,
  premises: /\b(mat bang|premises|retail)\b/,
  office: /\b(van phong|office)\b/,
};
/** "The Monarchy" → "monarchy", "Sun Ponte Residence" → "sun ponte". */
const core = (name: string) =>
  normalize(name)
    .replace(/^the\s+/, '')
    .replace(/\s+(residence|tower|da nang)$/, '');

/**
 * The real Google searches (Search Console) that fit one unit, most shown
 * first: those naming its project, then general ones for its kind of unit
 * in Đà Nẵng. Searches for buying are left out of a rental and the other
 * way round, and so are searches naming another project.
 */
export function unitSearches(
  rows: Row[],
  unit: { project?: string; kind?: string; listing: Listing; otherProjects?: string[] },
  max = 12,
): string[] {
  const shown = new Map<string, number>();
  for (const r of rows) shown.set(r.query, (shown.get(r.query) ?? 0) + r.impressions);
  const name = unit.project ? core(unit.project) : '';
  const others = (unit.otherProjects ?? []).map(core).filter((n) => n && n !== name);
  const kind = KIND_WORDS[unit.kind ?? 'apartment'] ?? KIND_WORDS.apartment;
  const ranked = [...shown]
    .map(([query, impressions]) => ({ query, text: normalize(query), impressions }))
    .filter(({ text }) => {
      if (unit.listing === 'rent' && SALE.test(text) && !RENT.test(text)) return false;
      if (unit.listing === 'sale' && RENT.test(text)) return false;
      return !others.some((n) => text.includes(n));
    })
    .sort((a, b) => b.impressions - a.impressions);
  const named = name ? ranked.filter((r) => r.text.includes(name)) : [];
  const general = ranked.filter((r) => !named.includes(r) && kind.test(r.text) && /\b(da nang|danang)\b/.test(r.text));
  return [...named, ...general].slice(0, max).map((r) => r.query);
}

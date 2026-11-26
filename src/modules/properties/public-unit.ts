import { slugify } from '../../common/utils/text.js';

/**
 * What visitors see of an owner's unit: never its real code or floor, which
 * Admin keeps. The code becomes the project's prefix and a random number
 * ("MN-95207"); the floor a band of its tower ("tầng cao"); and the unit's
 * own texts are rewritten the same way. Model units (with a floor note) are
 * the developer's layouts and keep their code.
 */
export type FloorBand = 'low' | 'mid' | 'high';
export const BAND_TEXT: Record<FloorBand, string> = { low: 'tầng thấp', mid: 'tầng trung', high: 'tầng cao' };

export type UnitFacts = {
  unitCode: string | null;
  floor: number | null;
  floorNote: string | null;
  tower: string | null;
  publicNumber: number | null;
  project: { codePrefix?: string | null; towers?: unknown } | null;
};

export const isModelUnit = (p: Pick<UnitFacts, 'floorNote'>) => !!p.floorNote?.trim();

/** "MN-95207"; "DV-…" outside any project or without a prefix set. */
export const publicCode = (p: UnitFacts) =>
  p.publicNumber ? `${(p.project?.codePrefix || 'DV').toUpperCase()}-${p.publicNumber}` : null;

/** Floors of the unit's tower, from Admin › Dự án › Các tòa (column "Số tầng"). */
function towerFloors(p: UnitFacts) {
  const towers = Array.isArray(p.project?.towers) ? (p.project.towers as { name?: string; floors?: number | string }[]) : [];
  const tower = towers.find((t) => t.name === p.tower) ?? (towers.length === 1 ? towers[0] : undefined);
  const floors = Number(tower?.floors);
  return floors > 0 ? floors : 30;
}

/** The lower, middle or upper third of its tower. */
export function floorBand(p: UnitFacts): FloorBand | null {
  if (!p.floor || isModelUnit(p)) return null;
  const share = p.floor / towerFloors(p);
  return share <= 1 / 3 ? 'low' : share <= 2 / 3 ? 'mid' : 'high';
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Codes this short ("A", "04") are left alone: replacing them would change other words. */
export const maskable = (code: string | null): code is string => !!code && code.replace(/[^0-9a-z]/gi, '').length >= 3;
/** "tầng 19", "Tầng 12A", "lầu 26", "floor 7": a floor written in a unit's text. */
const FLOOR_WORDS = /(?<![\p{L}\d])(tầng|tang|lầu|lau|floor)\s*(\d{1,2}[ab]?)(?![\p{L}\d])/giu;

/** A unit's own text as visitors see it. */
export function maskText(text: string | null, p: UnitFacts): string | null {
  if (!text || isModelUnit(p)) return text;
  const band = floorBand(p);
  let out = text.replace(FLOOR_WORDS, (_m, word: string) => {
    const said = band ? BAND_TEXT[band] : 'tầng';
    return word[0] === word[0].toUpperCase() ? said[0].toUpperCase() + said.slice(1) : said;
  });
  const code = publicCode(p);
  if (maskable(p.unitCode) && code) out = out.replace(new RegExp(`(?<![\\p{L}\\d-])${escape(p.unitCode)}(?![\\p{L}\\d])`, 'giu'), code);
  return out;
}

/**
 * What still gives the unit away in its masked text, for Admin to fix
 * (a floor in words, "T26", the code written another way…).
 */
export function leaks(texts: (string | null | undefined)[], p: UnitFacts): string[] {
  if (isModelUnit(p)) return [];
  const all = texts.filter(Boolean).join('\n');
  const found = new Set<string>();
  if (maskable(p.unitCode) && new RegExp(`(?<![\\p{L}\\d-])${escape(p.unitCode)}(?![\\p{L}\\d])`, 'iu').test(all)) found.add(p.unitCode);
  for (const m of all.matchAll(/(?<![\p{L}\d])(?:tầng|lầu)\s+(?:thứ\s+)?(?:một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|mươi)[\p{L} ]{0,20}/giu)) found.add(m[0].trim());
  if (p.floor) for (const m of all.matchAll(new RegExp(`(?<![\\p{L}\\d])[TL]${p.floor}(?:[AB])?(?![\\p{L}\\d])`, 'gu'))) found.add(m[0]);
  if (p.unitCode) {
    const digits = p.unitCode.replace(/[^0-9a-z]/gi, '');
    if (digits.length >= 3)
      for (const m of all.matchAll(/[0-9a-z][0-9a-z .-]{2,8}[0-9a-z]/gi))
        if (m[0].replace(/[^0-9a-z]/gi, '').toLowerCase() === digits.toLowerCase()) found.add(m[0]);
  }
  return [...found];
}

/** A unit's slug without its real code or floor, ending with its public code. */
export function publicSlug(base: string, p: UnitFacts) {
  const code = publicCode(p);
  let root = slugify(base);
  if (maskable(p.unitCode)) root = root.replace(new RegExp(`(^|-)${escape(slugify(p.unitCode))}(?=-|$)`, 'g'), '$1');
  root = root
    .replace(/(^|-)(tang|lau|floor)-\d{1,2}[ab]?(?=-|$)/g, '$1')
    .replace(/(^|-)(mn|sp|pn|az|st|hg|cs|ss|ct|dv|dvg)-\d{4,6}(?=-|$)/g, '$1')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
  return [root, code && slugify(code)].filter(Boolean).join('-') || 'can-ho';
}

import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { badRequest } from '../../common/errors.js';
import { DAY_MS as DAY, vnDay, vnDayStart } from '../../common/vn-day.js';
import { AppConfig } from '../../config/config.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';

/** Longest period one report covers. */
const MAX_DAYS = 366;
/** Units whose photo is put in the "Theo căn hộ" sheet (the rest list without one). */
const MAX_PHOTOS = 100;

/** The site's colours (admin palette). */
const C = {
  green: '123C32',
  primary: '1D5446',
  gold: 'C6A76B',
  goldSoft: 'F7EFDC',
  mint: 'EEF4F1',
  line: 'D6E1DC',
  ink: '202624',
  muted: '6B7A74',
  up: '1E7B4F',
  down: 'B3412F',
  white: 'FFFFFF',
};
/** Where unit views come from, in the dashboard's order and colours. */
const SOURCES: [key: string, label: string, color: string][] = [
  ['google', 'Google', '1D5446'],
  ['search', 'Bing, Naver, Yandex…', 'E6CF98'],
  ['ai', 'ChatGPT & AI', '5B9A83'],
  ['zalo', 'Zalo', '3B82C4'],
  ['facebook', 'Facebook', 'C9A45C'],
  ['direct', 'Vào thẳng', '8D6B2A'],
  ['other', 'Trang khác', '9FB3AB'],
  ['unknown', 'Chưa rõ (trước khi đo nguồn)', 'C3CEC9'],
];
const KIND: Record<string, string> = { live: 'Đang bán/thuê', model: 'Căn mẫu', hidden: 'Đã ẩn', deleted: 'Đã xoá' };
const AVAILABILITY: Record<string, string> = {
  AVAILABLE: 'Còn trống',
  RESERVED: 'Đã giữ chỗ',
  RENTED: 'Đã cho thuê',
  SOLD: 'Đã bán',
  MAINTENANCE: 'Đang bảo trì',
};
const LEAD_STATUS: Record<string, string> = { NEW: 'Mới', CONTACTING: 'Đang tư vấn', DONE: 'Hoàn tất', UNQUALIFIED: 'Không phù hợp' };
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const FONT = 'Arial';
const NUM = '#,##0';
const PCT = '0.0%';
const DATE = 'dd/mm/yyyy';

const n = (value: bigint | number | null | undefined) => Number(value ?? 0);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const vnDate = (d: Date) => `${iso(d).slice(8, 10)}/${iso(d).slice(5, 7)}/${iso(d).slice(0, 4)}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } });
const thin = (argb = C.line): Partial<ExcelJS.Borders> => {
  const side = { style: 'thin' as const, color: { argb: `FF${argb}` } };
  return { top: side, left: side, bottom: side, right: side };
};

type Unit = {
  id: string;
  name: string | null;
  unitCode: string | null;
  project: string | null;
  kind: string;
  availability: string | null;
  cover: string | null;
  views: number;
  leads: number;
  /** Taps on call / Zalo / WhatsApp links on its page. */
  clicks: number;
  sources: Map<string, number>;
};

/**
 * "Xuất Excel" on Tổng quan: one workbook for a chosen period — an overview
 * sheet (logo, key numbers, charts, top units with photos) and detail sheets
 * by day, unit, project and source, plus the contacts left when the user may
 * export them. Built here, next to the data and permissions: unit photos are
 * fetched server-side (no browser CORS) and the admin bundle stays small.
 *
 * ExcelJS has no chart support, so charts are drawn as SVG and put in as PNG
 * (sharp); the numbers behind them are in the detail sheets.
 */
@Injectable()
export class DashboardReportService {
  private readonly logger = new Logger(DashboardReportService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async build(fromIso: string, toIso: string, user: AuthUser) {
    const can = (p: string) => user.permissions.includes(p);
    const today = vnDay();
    const from = new Date(fromIso);
    // A month that is still running ends today.
    const to = new Date(Math.min(new Date(toIso).getTime(), today.getTime()));
    if (Number.isNaN(from.getTime()) || Number.isNaN(new Date(toIso).getTime()) || iso(from) !== fromIso || iso(new Date(toIso)) !== toIso)
      throw badRequest('Ngày không hợp lệ.');
    if (from > today) throw badRequest('Kỳ báo cáo chưa bắt đầu.');
    if (from > to) throw badRequest('Ngày bắt đầu phải trước ngày kết thúc.');
    const days = Math.round((to.getTime() - from.getTime()) / DAY) + 1;
    if (days > MAX_DAYS) throw badRequest(`Mỗi báo cáo tối đa ${MAX_DAYS} ngày.`);
    const until = new Date(to.getTime() + DAY);
    const prevFrom = new Date(from.getTime() - days * DAY);
    const leadsAllowed = can(PERMISSIONS.leadsRead);
    const contactsAllowed = leadsAllowed && can(PERMISSIONS.leadsExport);

    const [daily, dailySources, units, unitSources, prevViews, leadDays, prevLeads, leadForms, contacts, clicks, prevClicks] = await Promise.all([
      this.prisma.$queryRaw<{ day: Date; views: bigint }[]>`
        SELECT day, sum(views) AS views FROM property_view_days WHERE day >= ${from} AND day < ${until} GROUP BY day`,
      this.prisma.$queryRaw<{ day: Date; source: string; views: bigint }[]>`
        SELECT day, source, sum(views) AS views FROM property_view_sources WHERE day >= ${from} AND day < ${until} GROUP BY day, source`,
      this.prisma.$queryRaw<
        { id: string; name: string | null; unit_code: string | null; project: string | null; kind: string; availability: string | null; cover: string | null; views: bigint; leads: bigint }[]
      >`
        SELECT v.property_id AS id, u.name, u.unit_code, p.name AS project, u.availability::text AS availability, m.url AS cover,
          CASE WHEN u.id IS NULL OR u.deleted_at IS NOT NULL THEN 'deleted' WHEN u.status <> 'PUBLISHED' THEN 'hidden'
            WHEN coalesce(u.floor_note, '') <> '' THEN 'model' ELSE 'live' END AS kind,
          sum(v.views) AS views,
          (SELECT count(*) FROM leads l WHERE l.property_id = v.property_id AND l.deleted_at IS NULL
            AND l.created_at >= ${vnDayStart(from)} AND l.created_at < ${vnDayStart(until)}) AS leads
        FROM property_view_days v LEFT JOIN properties u ON u.id = v.property_id
          LEFT JOIN projects p ON p.id = u.project_id LEFT JOIN media_assets m ON m.id = u.cover_image_id
        WHERE v.day >= ${from} AND v.day < ${until}
        GROUP BY v.property_id, u.id, p.name, m.url
        ORDER BY sum(v.views) DESC, u.name`,
      this.prisma.$queryRaw<{ property_id: string; source: string; views: bigint }[]>`
        SELECT property_id, source, sum(views) AS views FROM property_view_sources
        WHERE day >= ${from} AND day < ${until} GROUP BY property_id, source`,
      this.prisma.$queryRaw<{ views: bigint | null }[]>`
        SELECT sum(views) AS views FROM property_view_days WHERE day >= ${prevFrom} AND day < ${from}`,
      leadsAllowed
        ? this.prisma.$queryRaw<{ day: Date; leads: bigint }[]>`
            SELECT (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, count(*) AS leads FROM leads
            WHERE deleted_at IS NULL AND created_at >= ${vnDayStart(from)} AND created_at < ${vnDayStart(until)} GROUP BY 1`
        : Promise.resolve([]),
      leadsAllowed
        ? this.prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: vnDayStart(prevFrom), lt: vnDayStart(from) } } })
        : Promise.resolve(0),
      leadsAllowed
        ? this.prisma.lead.groupBy({
            by: ['source'],
            where: { deletedAt: null, createdAt: { gte: vnDayStart(from), lt: vnDayStart(until) } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      contactsAllowed
        ? this.prisma.lead.findMany({
            where: {
              deletedAt: null,
              createdAt: { gte: vnDayStart(from), lt: vnDayStart(until) },
              // The same leads the user's own export gives (see LeadsService.scope).
              ...(user.roles.includes('admin') ? {} : { OR: [{ assigneeId: user.id }, { assigneeId: null }] }),
            },
            orderBy: { createdAt: 'desc' },
            take: 10_000,
            select: {
              createdAt: true, name: true, phone: true, email: true, source: true, intent: true, message: true, status: true,
              property: { select: { name: true, unitCode: true } }, project: { select: { name: true } }, assignee: { select: { name: true } },
            },
          })
        : Promise.resolve(null),
      this.prisma.contactClick.findMany({
        where: { createdAt: { gte: vnDayStart(from), lt: vnDayStart(until) } },
        orderBy: { createdAt: 'desc' },
        take: 10_000,
        select: { createdAt: true, kind: true, source: true, path: true, target: true, propertyId: true, property: { select: { name: true, unitCode: true, project: { select: { name: true } } } } },
      }),
      this.prisma.contactClick.count({ where: { createdAt: { gte: vnDayStart(prevFrom), lt: vnDayStart(from) } } }),
    ]);

    // One row per day of the period.
    const viewsBy = new Map(daily.map((r) => [iso(r.day), n(r.views)]));
    const leadsBy = new Map(leadDays.map((r) => [iso(r.day), n(r.leads)]));
    const srcBy = new Map<string, Map<string, number>>();
    for (const r of dailySources) {
      const m = srcBy.get(iso(r.day)) ?? new Map<string, number>();
      m.set(r.source, n(r.views));
      srcBy.set(iso(r.day), m);
    }
    // Taps on call / Zalo / WhatsApp links, by Vietnamese day and by unit.
    const clicksBy = new Map<string, Record<string, number>>();
    const unitClicks = new Map<string, number>();
    for (const c of clicks) {
      const key = iso(vnDay(c.createdAt));
      const kinds = clicksBy.get(key) ?? {};
      kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
      clicksBy.set(key, kinds);
      if (c.propertyId) unitClicks.set(c.propertyId, (unitClicks.get(c.propertyId) ?? 0) + 1);
    }
    const series = Array.from({ length: days }, (_, i) => {
      const day = new Date(from.getTime() + i * DAY);
      const views = viewsBy.get(iso(day)) ?? 0;
      const sources = srcBy.get(iso(day)) ?? new Map<string, number>();
      const known = [...sources.values()].reduce((s, v) => s + v, 0);
      if (views > known) sources.set('unknown', views - known);
      return { day, views, leads: leadsBy.get(iso(day)) ?? 0, sources, clicks: clicksBy.get(iso(day)) ?? {} };
    });
    const totalViews = series.reduce((s, d) => s + d.views, 0);
    const totalLeads = series.reduce((s, d) => s + d.leads, 0);
    const bySource = SOURCES.map(([key, label, color]) => ({
      key, label, color, views: series.reduce((s, d) => s + (d.sources.get(key) ?? 0), 0),
    })).filter((s) => s.views > 0).sort((a, b) => b.views - a.views);

    const perUnit = new Map<string, Map<string, number>>();
    for (const r of unitSources) perUnit.set(r.property_id, (perUnit.get(r.property_id) ?? new Map()).set(r.source, n(r.views)));
    const unitRows: Unit[] = units.map((r) => {
      const sources = perUnit.get(r.id) ?? new Map<string, number>();
      const known = [...sources.values()].reduce((s, v) => s + v, 0);
      if (n(r.views) > known) sources.set('unknown', n(r.views) - known);
      return {
        id: r.id, name: r.name, unitCode: r.unit_code, project: r.project, kind: r.kind, availability: r.availability,
        cover: r.cover, views: n(r.views), leads: leadsAllowed ? n(r.leads) : 0, clicks: unitClicks.get(r.id) ?? 0, sources,
      };
    });
    const projects = new Map<string, { name: string; units: number; views: number; leads: number }>();
    for (const u of unitRows) {
      const name = u.project ?? 'Căn đã xoá';
      const p = projects.get(name) ?? { name, units: 0, views: 0, leads: 0 };
      p.units += 1;
      p.views += u.views;
      p.leads += u.leads;
      projects.set(name, p);
    }

    const photos = await this.photos(unitRows.slice(0, MAX_PHOTOS).map((u) => u.cover));
    const month = from.getUTCDate() === 1 && new Date(toIso).getTime() === new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0)).getTime();
    const period = month
      ? `Tháng ${iso(from).slice(5, 7)}/${iso(from).slice(0, 4)} (${vnDate(from)} – ${vnDate(to)})`
      : `${vnDate(from)} – ${vnDate(to)}`;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Đất Vàng Group';
    wb.created = new Date();
    wb.title = `Báo cáo website ${period}`;
    const report: Report = {
      wb, period, days, user, from, to, series, bySource, unitRows, photos, photoIds: new Map(),
      projects: [...projects.values()].sort((a, b) => b.views - a.views),
      totalViews, prevViews: n(prevViews[0]?.views), leadsAllowed, totalLeads, prevLeads,
      clicks, prevClicks,
      leadForms: leadForms.map((r) => ({ source: r.source, count: r._count._all })).sort((a, b) => b.count - a.count),
    };
    await overviewSheet(report);
    daySheet(report);
    unitSheet(report);
    projectSheet(report);
    sourceSheet(report);
    clickSheet(report);
    if (contacts) contactSheet(wb, contacts);

    if (contacts)
      await this.audit.log({ actorId: user.id, action: 'lead.export', entityType: 'lead', changes: { count: contacts.length, report: { from: iso(from), to: iso(to) } } });
    // "T11⁄2026-Báo Cáo WEB Đất Vàng Group.xlsx", "1⁄11-15⁄11-Báo Cáo WEB Đất Vàng Group.xlsx":
    // "⁄" (fraction slash) stands for "/", which no file name may hold.
    const dm = (d: Date) => `${d.getUTCDate()}⁄${d.getUTCMonth() + 1}`;
    const period2 = month ? `T${from.getUTCMonth() + 1}⁄${from.getUTCFullYear()}` : `${dm(from)}-${dm(to)}`;
    const ascii = month ? iso(from).slice(0, 7) : `${iso(from)}_${iso(to)}`;
    return {
      buffer: Buffer.from(await wb.xlsx.writeBuffer()),
      filename: `${period2}-Báo Cáo WEB Đất Vàng Group.xlsx`,
      /** For clients that cannot read a UTF-8 file name. */
      fallback: `bao-cao-dat-vang-${ascii}.xlsx`,
    };
  }

  /** Unit photos as small JPEGs (null where there is none or it cannot be fetched). */
  private async photos(urls: (string | null)[]) {
    const site = this.config.get('SITE_URL');
    const cache = new Map<string, Promise<Buffer | null>>();
    const load = (url: string) =>
      fetch(new URL(url, site), { signal: AbortSignal.timeout(5000) })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return sharp(Buffer.from(await res.arrayBuffer())).resize(192, 128, { fit: 'cover' }).jpeg({ quality: 78 }).toBuffer();
        })
        .catch((err: unknown) => {
          this.logger.warn({ err: String(err), url }, 'report photo skipped');
          return null;
        });
    // A few at a time, each address fetched once.
    const out: (Buffer | null)[] = [];
    for (let i = 0; i < urls.length; i += 8)
      out.push(
        ...(await Promise.all(
          urls.slice(i, i + 8).map((url) => {
            if (!url) return null;
            if (!cache.has(url)) cache.set(url, load(url));
            return cache.get(url)!;
          }),
        )),
      );
    return out;
  }
}

type Report = {
  wb: ExcelJS.Workbook;
  period: string;
  days: number;
  user: AuthUser;
  from: Date;
  to: Date;
  series: { day: Date; views: number; leads: number; sources: Map<string, number>; clicks: Record<string, number> }[];
  bySource: { key: string; label: string; color: string; views: number }[];
  unitRows: Unit[];
  photos: (Buffer | null)[];
  /** Workbook image ids of the photos already put in, so each is stored once. */
  photoIds: Map<number, number>;
  projects: { name: string; units: number; views: number; leads: number }[];
  totalViews: number;
  prevViews: number;
  leadsAllowed: boolean;
  totalLeads: number;
  prevLeads: number;
  leadForms: { source: string; count: number }[];
  clicks: Click[];
  prevClicks: number;
};
type Click = {
  createdAt: Date; kind: string; source: string; path: string; target: string | null; propertyId: string | null;
  property: { name: string; unitCode: string | null; project: { name: string } } | null;
};
const CLICK_KINDS: [key: string, label: string][] = [['call', 'Bấm gọi'], ['zalo', 'Bấm Zalo'], ['whatsapp', 'Bấm WhatsApp']];

const logo = readFile(new URL('./report-logo.png', import.meta.url));

/** A sheet with the report's page setup: A4 landscape, one page wide, page numbers. */
function sheet(wb: ExcelJS.Workbook, name: string, color: string, frozen?: { row: number; col?: number }) {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: `FF${color}` } },
    views: [{ state: frozen ? 'frozen' : 'normal', ySplit: frozen?.row ?? 0, xSplit: frozen?.col ?? 0, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: `&L&8Đất Vàng Group · datvanggroup.vn&R&8Trang &P/&N` },
  });
  ws.properties.defaultRowHeight = 18;
  return ws;
}

/** A detail sheet's title lines and its table header (row 4), frozen below it. */
function table(r: Report, name: string, title: string, columns: { header: string; width: number; fmt?: string; align?: 'left' | 'center' | 'right' }[], color: string = C.primary) {
  const ws = sheet(r.wb, name, color, { row: 4 });
  ws.columns = columns.map((c) => ({ width: c.width, style: { font: { name: FONT, size: 10, color: { argb: `FF${C.ink}` } }, numFmt: c.fmt, alignment: { vertical: 'middle', horizontal: c.align, wrapText: c.align === 'left' } } }));
  ws.mergeCells(1, 1, 1, columns.length);
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { name: FONT, size: 14, bold: true, color: { argb: `FF${C.green}` } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, columns.length);
  ws.getCell(2, 1).value = `Đất Vàng Group · Kỳ báo cáo: ${r.period}`;
  ws.getCell(2, 1).font = { name: FONT, size: 10, italic: true, color: { argb: `FF${C.muted}` } };
  const head = ws.getRow(4);
  head.values = columns.map((c) => c.header);
  head.height = 30;
  head.eachCell((cell) => {
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: `FF${C.white}` } };
    cell.fill = fill(C.green);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thin(C.green);
  });
  return ws;
}

/** Zebra rows and borders for rows `first`..`last`; a bold total row when `total`. */
function body(ws: ExcelJS.Worksheet, first: number, last: number, total?: boolean) {
  for (let i = first; i <= last; i++) {
    const row = ws.getRow(i);
    for (let c = 1; c <= ws.columnCount; c++) {
      const cell = row.getCell(c);
      cell.border = thin();
      if (total && i === last) {
        cell.fill = fill(C.goldSoft);
        cell.font = { ...cell.font, name: FONT, bold: true };
        cell.border = { ...thin(), top: { style: 'medium', color: { argb: `FF${C.gold}` } } };
      } else if ((i - first) % 2) cell.fill = fill(C.mint);
    }
  }
}

const delta = (now: number, before: number) => (before ? (now - before) / before : null);
const sourceLabel = (key: string) => SOURCES.find(([k]) => k === key)?.[1] ?? key;
const topSource = (u: Unit) => [...u.sources].sort((a, b) => b[1] - a[1])[0];
const unitTitle = (u: Unit) => u.name ?? 'Căn đã xoá';
const readablePath = (path: string) => {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
};

async function overviewSheet(r: Report) {
  const ws = sheet(r.wb, 'Tổng quan', C.gold);
  const widths = [6, 15, 34, 24, 13, 13, 24];
  ws.columns = widths.map((width) => ({ width, style: { font: { name: FONT, size: 10, color: { argb: `FF${C.ink}` } }, alignment: { vertical: 'middle' } } }));
  const last = widths.length;

  // Banner: logo on the site's dark green, title, period.
  for (let row = 1; row <= 5; row++) {
    ws.getRow(row).height = row === 1 || row === 5 ? 10 : 24;
    for (let c = 1; c <= last; c++) ws.getCell(row, c).fill = fill(C.green);
  }
  ws.addImage(r.wb.addImage({ buffer: (await logo) as unknown as ExcelJS.Buffer, extension: 'png' }), {
    tl: { col: 0.25, row: 0.3 }, ext: { width: 88, height: 83 }, editAs: 'oneCell',
  });
  const banner = (row: number, text: string, font: Partial<ExcelJS.Font>) => {
    ws.mergeCells(row, 3, row, last);
    ws.getCell(row, 3).value = text;
    ws.getCell(row, 3).font = { name: FONT, ...font };
  };
  banner(2, 'BÁO CÁO HOẠT ĐỘNG WEBSITE', { size: 18, bold: true, color: { argb: `FF${C.white}` } });
  banner(3, 'ĐẤT VÀNG GROUP · datvanggroup.vn', { size: 11, bold: true, color: { argb: `FF${C.gold}` } });
  banner(4, `Kỳ báo cáo: ${r.period} · ${r.days} ngày`, { size: 11, color: { argb: `FF${C.white}` } });
  ws.mergeCells(6, 1, 6, last);
  const now = new Date(Date.now() + 7 * 3_600_000);
  ws.getCell(6, 1).value = `Xuất lúc ${vnDate(now)} ${now.toISOString().slice(11, 16)} · bởi ${r.user.name} · so sánh với ${r.days} ngày liền trước`;
  ws.getCell(6, 1).font = { name: FONT, size: 9, italic: true, color: { argb: `FF${C.muted}` } };
  ws.getCell(6, 1).alignment = { horizontal: 'right', vertical: 'middle' };

  let row = 8;
  const heading = (text: string) => {
    ws.mergeCells(row, 1, row, last);
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = { name: FONT, size: 12, bold: true, color: { argb: `FF${C.green}` } };
    cell.border = { bottom: { style: 'medium', color: { argb: `FF${C.gold}` } } };
    ws.getRow(row).height = 24;
    row += 2;
  };

  // Key numbers, as cards: label, value, comparison.
  heading('CHỈ SỐ CHÍNH');
  const viewed = r.unitRows.length;
  const calls = r.clicks.filter((c) => c.kind === 'call').length;
  const cards: { cols: [number, number]; label: string; value: number | null; fmt: string; note: string; change?: number | null }[] = [
    { cols: [1, 2], label: 'Lượt xem căn hộ', value: r.totalViews, fmt: NUM, note: `Kỳ trước: ${r.prevViews.toLocaleString('vi-VN')}`, change: delta(r.totalViews, r.prevViews) },
    {
      cols: [3, 3], label: 'Khách bấm gọi / Zalo', value: r.clicks.length, fmt: NUM,
      note: `${calls.toLocaleString('vi-VN')} gọi · ${(r.clicks.length - calls).toLocaleString('vi-VN')} Zalo/WhatsApp · kỳ trước ${r.prevClicks.toLocaleString('vi-VN')}`,
      change: delta(r.clicks.length, r.prevClicks),
    },
    r.leadsAllowed
      ? { cols: [4, 4], label: 'Khách để lại liên hệ', value: r.totalLeads, fmt: NUM, note: `Kỳ trước: ${r.prevLeads.toLocaleString('vi-VN')}`, change: delta(r.totalLeads, r.prevLeads) }
      : { cols: [4, 4], label: 'Khách để lại liên hệ', value: null, fmt: NUM, note: 'Cần quyền xem khách hàng' },
    {
      cols: [5, 6], label: 'Tỉ lệ khách liên hệ', value: r.totalViews ? (r.clicks.length + (r.leadsAllowed ? r.totalLeads : 0)) / r.totalViews : 0, fmt: '0.00%',
      note: r.leadsAllowed ? '(Bấm gọi/Zalo + form) / lượt xem' : 'Bấm gọi/Zalo / lượt xem',
    },
    { cols: [7, 7], label: 'Căn hộ được xem', value: viewed, fmt: NUM, note: `TB ${(r.totalViews / r.days).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} lượt/ngày` },
  ];
  ws.getRow(row).height = 20;
  ws.getRow(row + 1).height = 34;
  ws.getRow(row + 2).height = 20;
  for (const card of cards) {
    const [a, b] = card.cols;
    for (let i = 0; i < 3; i++) {
      if (a !== b) ws.mergeCells(row + i, a, row + i, b);
      const cell = ws.getCell(row + i, a);
      cell.fill = fill(i === 1 ? C.white : C.mint);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      const edge = { style: 'thin' as const, color: { argb: `FF${C.line}` } };
      cell.border = { left: edge, right: edge, top: i === 0 ? { style: 'thick', color: { argb: `FF${C.primary}` } } : undefined, bottom: i === 2 ? edge : undefined };
    }
    ws.getCell(row, a).value = card.label.toUpperCase();
    ws.getCell(row, a).font = { name: FONT, size: 8, bold: true, color: { argb: `FF${C.muted}` } };
    const value = ws.getCell(row + 1, a);
    value.value = card.value ?? '—';
    value.numFmt = card.fmt;
    value.font = { name: FONT, size: 20, bold: true, color: { argb: `FF${C.green}` } };
    const note = ws.getCell(row + 2, a);
    const change = card.change;
    note.value = change == null ? card.note : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% · ${card.note}`;
    note.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    note.font = { name: FONT, size: 9, color: { argb: `FF${change == null ? C.muted : change >= 0 ? C.up : C.down}` } };
  }
  row += 4;

  // Views (bars) and contacts (gold dots) per day.
  heading('LƯỢT XEM THEO NGÀY');
  const chart = await sharp(Buffer.from(dailyChart(r))).png().toBuffer();
  ws.addImage(r.wb.addImage({ buffer: chart as unknown as ExcelJS.Buffer, extension: 'png' }), {
    tl: { col: 0, row: row - 1 }, ext: { width: 860, height: 270 }, editAs: 'oneCell',
  });
  row += 12;

  // Where the views come from: table on the left, donut on the right.
  heading('NGUỒN TRUY CẬP');
  const head = ws.getRow(row);
  ['', 'Nguồn', '', 'Lượt xem', 'Tỉ lệ'].forEach((text, i) => (head.getCell(i + 1).value = text || null));
  ws.mergeCells(row, 2, row, 3);
  for (let c = 1; c <= 5; c++) {
    const cell = head.getCell(c);
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: `FF${C.white}` } };
    cell.fill = fill(C.green);
    cell.alignment = { horizontal: c >= 4 ? 'center' : 'left', vertical: 'middle' };
  }
  const donutTop = row - 1;
  const firstSource = row + 1;
  for (const s of r.bySource) {
    row++;
    ws.getCell(row, 1).fill = fill(s.color);
    ws.mergeCells(row, 2, row, 3);
    ws.getCell(row, 2).value = s.label;
    ws.getCell(row, 4).value = s.views;
    ws.getCell(row, 4).numFmt = NUM;
    ws.getCell(row, 5).value = r.totalViews ? s.views / r.totalViews : 0;
    ws.getCell(row, 5).numFmt = PCT;
  }
  if (!r.bySource.length) ws.getCell(++row, 2).value = 'Chưa có lượt xem trong kỳ.';
  row++;
  ws.mergeCells(row, 2, row, 3);
  ws.getCell(row, 2).value = 'Tổng cộng';
  ws.getCell(row, 4).value = r.totalViews;
  ws.getCell(row, 4).numFmt = NUM;
  ws.getCell(row, 5).value = r.totalViews ? 1 : 0;
  ws.getCell(row, 5).numFmt = PCT;
  for (let i = firstSource; i <= row; i++)
    for (let c = 2; c <= 5; c++) {
      const cell = ws.getCell(i, c);
      cell.border = { bottom: { style: 'thin', color: { argb: `FF${C.line}` } } };
      if (i === row) {
        cell.font = { name: FONT, size: 10, bold: true };
        cell.fill = fill(C.goldSoft);
      }
    }
  if (r.bySource.length) {
    const donutPng = await sharp(Buffer.from(donut(r.bySource))).png().toBuffer();
    ws.addImage(r.wb.addImage({ buffer: donutPng as unknown as ExcelJS.Buffer, extension: 'png' }), {
      tl: { col: 5.3, row: donutTop }, ext: { width: 190, height: 190 }, editAs: 'oneCell',
    });
  }
  row = Math.max(row + 2, donutTop + 13);

  // The ten most viewed units, with their photo.
  heading('CĂN HỘ ĐƯỢC XEM NHIỀU NHẤT');
  const top = ws.getRow(row);
  ['#', 'Ảnh', 'Căn hộ', 'Dự án', 'Lượt xem', r.leadsAllowed ? 'Form · Bấm gọi' : 'Bấm gọi/Zalo', 'Nguồn chính'].forEach((text, i) => {
    const cell = top.getCell(i + 1);
    cell.value = text || null;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: `FF${C.white}` } };
    cell.fill = fill(C.green);
    cell.alignment = { horizontal: i >= 4 && i <= 5 ? 'center' : 'left', vertical: 'middle' };
  });
  r.unitRows.slice(0, 10).forEach((u, i) => {
    row++;
    const line = ws.getRow(row);
    line.height = 54;
    line.getCell(1).value = i + 1;
    line.getCell(1).font = { name: FONT, size: 14, bold: true, color: { argb: `FF${i < 3 ? C.gold : C.muted}` } };
    line.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    photo(r, ws, i, row);
    line.getCell(3).value = { richText: [{ text: unitTitle(u), font: { name: FONT, size: 10, bold: true, color: { argb: `FF${C.ink}` } } }, ...(u.unitCode ? [{ text: `\nMã căn ${u.unitCode}`, font: { name: FONT, size: 9, color: { argb: `FF${C.muted}` } } }] : [])] };
    line.getCell(3).alignment = { wrapText: true, vertical: 'middle' };
    line.getCell(4).value = u.project ?? '—';
    line.getCell(4).alignment = { wrapText: true, vertical: 'middle' };
    line.getCell(5).value = u.views;
    line.getCell(5).numFmt = NUM;
    line.getCell(5).font = { name: FONT, size: 12, bold: true, color: { argb: `FF${C.green}` } };
    line.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    line.getCell(6).value = r.leadsAllowed ? `${u.leads} · ${u.clicks}` : u.clicks;
    line.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    const main = topSource(u);
    line.getCell(7).value = main ? `${sourceLabel(main[0])} (${Math.round((main[1] / u.views) * 100)}%)` : '—';
    line.getCell(7).alignment = { wrapText: true, vertical: 'middle' };
    for (let c = 1; c <= last; c++) {
      ws.getCell(row, c).border = { bottom: { style: 'thin', color: { argb: `FF${C.line}` } } };
      if (i % 2) ws.getCell(row, c).fill = fill(C.mint);
    }
  });
  if (!r.unitRows.length) ws.getCell(++row, 3).value = 'Chưa có căn hộ nào được xem trong kỳ.';
  row += 2;
  ws.mergeCells(row, 1, row, last);
  ws.getCell(row, 1).value =
    'Ghi chú: lượt xem không tính khi người xem đang đăng nhập Admin. "Chưa rõ" là lượt xem trước khi website bắt đầu ghi nhận nguồn. Chi tiết ở các sheet bên cạnh.';
  ws.getCell(row, 1).font = { name: FONT, size: 9, italic: true, color: { argb: `FF${C.muted}` } };
  ws.getCell(row, 1).alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(row).height = 30;
  ws.pageSetup.printArea = `A1:G${row}`;
}

/** Puts the photo of unit `index` (of `r.unitRows`) into column B of `row`. */
function photo(r: Report, ws: ExcelJS.Worksheet, index: number, row: number, col = 1) {
  const buffer = r.photos[index];
  if (!buffer) {
    ws.getCell(row, col + 1).value = 'Chưa có ảnh';
    ws.getCell(row, col + 1).font = { name: FONT, size: 8, italic: true, color: { argb: `FF${C.muted}` } };
    ws.getCell(row, col + 1).alignment = { horizontal: 'center', vertical: 'middle' };
    return;
  }
  if (!r.photoIds.has(index)) r.photoIds.set(index, r.wb.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: 'jpeg' }));
  ws.addImage(r.photoIds.get(index)!, {
    tl: { col: col + 0.08, row: row - 1 + 0.08 }, ext: { width: 96, height: 64 }, editAs: 'oneCell',
  });
}

function daySheet(r: Report) {
  const sources = SOURCES.filter(([key]) => r.bySource.some((s) => s.key === key));
  const ws = table(r, 'Theo ngày', 'LƯỢT XEM VÀ LIÊN HỆ THEO NGÀY', [
    { header: 'Ngày', width: 13, fmt: DATE, align: 'center' },
    { header: 'Thứ', width: 7, align: 'center' },
    { header: 'Lượt xem', width: 12, fmt: NUM, align: 'right' },
    ...sources.map(([, label]) => ({ header: label, width: Math.max(11, Math.min(label.length + 2, 16)), fmt: NUM, align: 'right' as const })),
    ...CLICK_KINDS.map(([, label]) => ({ header: label, width: 11, fmt: NUM, align: 'right' as const })),
    ...(r.leadsAllowed ? [{ header: 'Khách liên hệ (form)', width: 13, fmt: NUM, align: 'right' as const }] : []),
  ]);
  for (const d of r.series)
    ws.addRow([d.day, WEEKDAY[d.day.getUTCDay()], d.views, ...sources.map(([key]) => d.sources.get(key) ?? 0), ...CLICK_KINDS.map(([key]) => d.clicks[key] ?? 0), ...(r.leadsAllowed ? [d.leads] : [])]);
  const total = ws.addRow([
    'Tổng cộng', '', r.totalViews, ...sources.map(([key]) => r.bySource.find((s) => s.key === key)!.views),
    ...CLICK_KINDS.map(([key]) => r.clicks.filter((c) => c.kind === key).length), ...(r.leadsAllowed ? [r.totalLeads] : []),
  ]);
  body(ws, 5, total.number, true);
  // Weekends stand out; the busiest days get a green bar.
  r.series.forEach((d, i) => {
    if (d.day.getUTCDay() % 6 === 0) ws.getCell(5 + i, 2).font = { name: FONT, size: 10, bold: true, color: { argb: `FF${C.down}` } };
  });
  ws.addConditionalFormatting({
    ref: `C5:C${total.number - 1}`,
    rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: `FF${C.gold}` }, gradient: false } as ExcelJS.DataBarRuleType],
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: total.number - 1, column: ws.columnCount } };
}

function unitSheet(r: Report) {
  const sources = SOURCES.filter(([key]) => r.bySource.some((s) => s.key === key));
  const ws = table(r, 'Theo căn hộ', 'LƯỢT XEM THEO CĂN HỘ', [
    { header: '#', width: 5, align: 'center' },
    { header: 'Ảnh', width: 15, align: 'center' },
    { header: 'Mã căn', width: 12, align: 'center' },
    { header: 'Căn hộ', width: 38, align: 'left' },
    { header: 'Dự án', width: 22, align: 'left' },
    { header: 'Hiển thị', width: 14, align: 'center' },
    { header: 'Tình trạng', width: 14, align: 'center' },
    { header: 'Lượt xem', width: 11, fmt: NUM, align: 'right' },
    { header: '% tổng', width: 9, fmt: PCT, align: 'right' },
    { header: 'Bấm gọi/Zalo', width: 10, fmt: NUM, align: 'right' },
    ...(r.leadsAllowed ? [{ header: 'Liên hệ (form)', width: 10, fmt: NUM, align: 'right' as const }] : []),
    ...sources.map(([, label]) => ({ header: label, width: Math.max(10, Math.min(label.length + 2, 16)), fmt: NUM, align: 'right' as const })),
  ]);
  ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 4, showGridLines: false }];
  r.unitRows.forEach((u, i) => {
    const row = ws.addRow([
      i + 1, null, u.unitCode ?? '', unitTitle(u), u.project ?? '—', KIND[u.kind] ?? u.kind,
      u.availability ? (AVAILABILITY[u.availability] ?? u.availability) : '—', u.views, r.totalViews ? u.views / r.totalViews : 0,
      u.clicks, ...(r.leadsAllowed ? [u.leads] : []), ...sources.map(([key]) => u.sources.get(key) ?? 0),
    ]);
    row.height = i < MAX_PHOTOS ? 54 : 20;
    if (i < MAX_PHOTOS) photo(r, ws, i, row.number);
  });
  const total = ws.addRow(['', '', '', 'Tổng cộng', '', '', '', r.totalViews, r.totalViews ? 1 : 0, r.unitRows.reduce((s, u) => s + u.clicks, 0), ...(r.leadsAllowed ? [r.unitRows.reduce((s, u) => s + u.leads, 0)] : []), ...sources.map(([key]) => r.bySource.find((s) => s.key === key)!.views)]);
  body(ws, 5, total.number, true);
  if (r.unitRows.length > MAX_PHOTOS) {
    const note = ws.addRow([`Ảnh hiển thị cho ${MAX_PHOTOS} căn được xem nhiều nhất.`]);
    note.getCell(1).font = { name: FONT, size: 9, italic: true, color: { argb: `FF${C.muted}` } };
    note.getCell(1).alignment = { wrapText: false };
  }
  if (r.unitRows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: total.number - 1, column: ws.columnCount } };
}

function projectSheet(r: Report) {
  const ws = table(r, 'Theo dự án', 'LƯỢT XEM THEO DỰ ÁN', [
    { header: '#', width: 5, align: 'center' },
    { header: 'Dự án', width: 36, align: 'left' },
    { header: 'Số căn được xem', width: 16, fmt: NUM, align: 'right' },
    { header: 'Lượt xem', width: 13, fmt: NUM, align: 'right' },
    { header: '% tổng', width: 10, fmt: PCT, align: 'right' },
    ...(r.leadsAllowed ? [{ header: 'Liên hệ', width: 10, fmt: NUM, align: 'right' as const }] : []),
  ]);
  r.projects.forEach((p, i) => ws.addRow([i + 1, p.name, p.units, p.views, r.totalViews ? p.views / r.totalViews : 0, ...(r.leadsAllowed ? [p.leads] : [])]));
  const total = ws.addRow(['', 'Tổng cộng', r.unitRows.length, r.totalViews, r.totalViews ? 1 : 0, ...(r.leadsAllowed ? [r.projects.reduce((s, p) => s + p.leads, 0)] : [])]);
  body(ws, 5, total.number, true);
  if (r.projects.length)
    ws.addConditionalFormatting({
      ref: `D5:D${total.number - 1}`,
      rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: `FF${C.primary}` }, gradient: false } as ExcelJS.DataBarRuleType],
    });
}

function sourceSheet(r: Report) {
  const ws = table(r, 'Nguồn truy cập', 'NGUỒN TRUY CẬP CĂN HỘ', [
    { header: '', width: 4 },
    { header: 'Nguồn', width: 32, align: 'left' },
    { header: 'Lượt xem', width: 13, fmt: NUM, align: 'right' },
    { header: '% tổng', width: 10, fmt: PCT, align: 'right' },
    { header: 'Căn được xem từ nguồn này', width: 16, fmt: NUM, align: 'right' },
    { header: 'Căn xem nhiều nhất từ nguồn này', width: 44, align: 'left' },
  ]);
  for (const s of r.bySource) {
    const units = r.unitRows.filter((u) => u.sources.get(s.key));
    const best = units.sort((a, b) => b.sources.get(s.key)! - a.sources.get(s.key)!)[0];
    const row = ws.addRow(['', s.label, s.views, r.totalViews ? s.views / r.totalViews : 0, units.length, best ? `${unitTitle(best)} (${best.sources.get(s.key)!.toLocaleString('vi-VN')})` : '']);
    row.getCell(1).fill = fill(s.color);
  }
  const total = ws.addRow(['', 'Tổng cộng', r.totalViews, r.totalViews ? 1 : 0, r.unitRows.length, '']);
  body(ws, 5, total.number, true);
  r.bySource.forEach((s, i) => (ws.getCell(5 + i, 1).fill = fill(s.color)));
  if (r.leadsAllowed && r.leadForms.length) {
    ws.addRow([]);
    const title = ws.addRow(['', 'KHÁCH LIÊN HỆ THEO FORM', 'Số khách', '% tổng']);
    title.eachCell((cell, c) => {
      if (c === 1) return;
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: `FF${C.white}` } };
      cell.fill = fill(C.primary);
      cell.alignment = { horizontal: c > 2 ? 'center' : 'left', vertical: 'middle' };
    });
    const first = title.number + 1;
    for (const f of r.leadForms) ws.addRow(['', f.source, f.count, r.totalLeads ? f.count / r.totalLeads : 0]);
    for (let i = first; i < first + r.leadForms.length; i++)
      for (let c = 2; c <= 4; c++) ws.getCell(i, c).border = { bottom: { style: 'thin', color: { argb: `FF${C.line}` } } };
  }
}

/** Every tap on a call / Zalo / WhatsApp link, latest first. */
function clickSheet(r: Report) {
  const ws = table(r, 'Lượt bấm gọi', 'KHÁCH BẤM GỌI / ZALO / WHATSAPP', [
    { header: 'Thời gian', width: 17, fmt: 'dd/mm/yyyy hh:mm', align: 'center' },
    { header: 'Loại', width: 14, align: 'center' },
    { header: 'Số / địa chỉ bấm', width: 20, align: 'left' },
    { header: 'Căn hộ', width: 38, align: 'left' },
    { header: 'Dự án', width: 20, align: 'left' },
    { header: 'Trang', width: 44, align: 'left' },
    { header: 'Khách đến từ', width: 22, align: 'left' },
  ], C.gold);
  for (const c of r.clicks)
    ws.addRow([
      // Excel shows the stored time as is: store the Vietnamese wall clock.
      new Date(c.createdAt.getTime() + 7 * 3_600_000), CLICK_KINDS.find(([k]) => k === c.kind)?.[1] ?? c.kind, c.target ?? '',
      c.property ? `${c.property.name}${c.property.unitCode ? ` (${c.property.unitCode})` : ''}` : '', c.property?.project.name ?? '',
      readablePath(c.path), sourceLabel(c.source),
    ]);
  if (!r.clicks.length) ws.addRow(['', 'Chưa có lượt bấm nào trong kỳ.']);
  body(ws, 5, ws.rowCount);
  if (r.clicks.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: ws.rowCount, column: 7 } };
}

type Contact = {
  createdAt: Date; name: string; phone: string | null; email: string; source: string; intent: string | null; message: string; status: string;
  property: { name: string; unitCode: string | null } | null; project: { name: string } | null; assignee: { name: string } | null;
};
function contactSheet(wb: ExcelJS.Workbook, contacts: Contact[]) {
  const r = { wb, period: '' } as Report;
  const ws = table(r, 'Khách liên hệ', 'KHÁCH ĐỂ LẠI LIÊN HỆ', [
    { header: 'Thời gian', width: 17, fmt: 'dd/mm/yyyy hh:mm', align: 'center' },
    { header: 'Họ tên', width: 22, align: 'left' },
    { header: 'Điện thoại', width: 15, align: 'center' },
    { header: 'Email', width: 28, align: 'left' },
    { header: 'Form', width: 16, align: 'left' },
    { header: 'Nhu cầu', width: 14, align: 'left' },
    { header: 'Căn hộ / dự án', width: 30, align: 'left' },
    { header: 'Trạng thái', width: 14, align: 'center' },
    { header: 'Phụ trách', width: 16, align: 'left' },
    { header: 'Nội dung', width: 48, align: 'left' },
  ], C.gold);
  ws.getCell(2, 1).value = 'Dữ liệu cá nhân của khách hàng — chỉ dùng nội bộ, không chia sẻ ra ngoài.';
  ws.getCell(2, 1).font = { name: FONT, size: 10, bold: true, color: { argb: `FF${C.down}` } };
  ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 2, showGridLines: false }];
  for (const l of contacts) {
    const place = l.property ? `${l.property.name}${l.property.unitCode ? ` (${l.property.unitCode})` : ''}` : (l.project?.name ?? '');
    // Excel shows the stored time as is: store the Vietnamese wall clock.
    ws.addRow([new Date(l.createdAt.getTime() + 7 * 3_600_000), l.name, l.phone ?? '', l.email, l.source, l.intent ?? '', place, LEAD_STATUS[l.status] ?? l.status, l.assignee?.name ?? '', l.message]);
  }
  if (!contacts.length) ws.addRow(['', 'Không có khách liên hệ trong kỳ.']);
  body(ws, 5, ws.rowCount);
  if (contacts.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: ws.rowCount, column: 10 } };
}

const SVG_FONT = "font-family=\"DejaVu Sans, Arial, Helvetica, sans-serif\"";
/** Bars for views per day, gold dots for days with contacts; drawn at 2× for sharpness. */
function dailyChart(r: Report) {
  const W = 1720, H = 540, left = 90, right = 30, top = 50, bottom = 70;
  const max = Math.max(4, ...r.series.map((d) => d.views));
  const step = 10 ** Math.floor(Math.log10(max / 4));
  const tick = [1, 2, 5, 10].map((m) => m * step).find((t) => max / t <= 5)!;
  const ceil = Math.ceil(max / tick) * tick;
  const plotW = W - left - right, plotH = H - top - bottom;
  const slot = plotW / r.series.length;
  const bar = Math.max(2, Math.min(44, slot * 0.68));
  const y = (v: number) => top + plotH - (v / ceil) * plotH;
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="#ffffff"/>`];
  for (let v = 0; v <= ceil; v += tick)
    parts.push(
      `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" stroke="#${v ? 'E3EAE6' : 'B9C7C0'}" stroke-width="2"/>`,
      `<text x="${left - 14}" y="${y(v) + 8}" text-anchor="end" font-size="22" fill="#${C.muted}" ${SVG_FONT}>${v.toLocaleString('vi-VN')}</text>`,
    );
  const every = Math.ceil(r.series.length / 12);
  r.series.forEach((d, i) => {
    const x = left + i * slot + (slot - bar) / 2;
    if (d.views) parts.push(`<rect x="${x}" y="${y(d.views)}" width="${bar}" height="${y(0) - y(d.views)}" rx="${Math.min(6, bar / 3)}" fill="#${C.primary}"/>`);
    if (d.leads) parts.push(`<circle cx="${x + bar / 2}" cy="${y(d.views) - 16}" r="9" fill="#${C.gold}" stroke="#ffffff" stroke-width="3"/>`);
    if (i % every === 0 || i === r.series.length - 1)
      parts.push(`<text x="${x + bar / 2}" y="${H - bottom + 34}" text-anchor="middle" font-size="21" fill="#${C.muted}" ${SVG_FONT}>${vnDate(d.day).slice(0, 5)}</text>`);
  });
  parts.push(
    `<rect x="${left}" y="10" width="22" height="22" rx="4" fill="#${C.primary}"/>`,
    `<text x="${left + 32}" y="29" font-size="22" fill="#${C.ink}" ${SVG_FONT}>Lượt xem căn hộ</text>`,
  );
  if (r.leadsAllowed)
    parts.push(
      `<circle cx="${left + 275}" cy="21" r="10" fill="#${C.gold}"/>`,
      `<text x="${left + 295}" y="29" font-size="22" fill="#${C.ink}" ${SVG_FONT}>Ngày có khách để lại liên hệ</text>`,
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;
}

/** Share of views by source as a ring, total in the middle; drawn at 2×. */
function donut(sources: Report['bySource']) {
  const S = 380, cx = S / 2, cy = S / 2, R = 170, r = 108;
  const total = sources.reduce((s, x) => s + x.views, 0);
  let angle = -Math.PI / 2;
  const parts = [`<rect width="${S}" height="${S}" fill="#ffffff"/>`];
  for (const s of sources) {
    const sweep = (s.views / total) * Math.PI * 2;
    if (sweep >= Math.PI * 2 - 1e-6) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="#${s.color}" stroke-width="${R - r}"/>`);
      break;
    }
    const end = angle + sweep;
    const p = (rad: number, a: number) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;
    const large = sweep > Math.PI ? 1 : 0;
    parts.push(`<path d="M ${p(R, angle)} A ${R} ${R} 0 ${large} 1 ${p(R, end)} L ${p(r, end)} A ${r} ${r} 0 ${large} 0 ${p(r, angle)} Z" fill="#${s.color}" stroke="#ffffff" stroke-width="3"/>`);
    angle = end;
  }
  parts.push(
    `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="44" font-weight="bold" fill="#${C.green}" ${SVG_FONT}>${esc(total.toLocaleString('vi-VN'))}</text>`,
    `<text x="${cx}" y="${cy + 40}" text-anchor="middle" font-size="22" fill="#${C.muted}" ${SVG_FONT}>lượt xem</text>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${parts.join('')}</svg>`;
}


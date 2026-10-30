import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { MediaModule } from '../media/media.module.js';
import { MediaService } from '../media/media.service.js';

class DashboardQuery {
  /** Length of the period, in days; it is compared with the one before. */
  @IsOptional() @Type(() => Number) @IsIn([7, 30, 90]) days: 7 | 30 | 90 = 30;
}

const DAY = 86_400_000;
const utcDay = (date: Date) => new Date(date.toISOString().slice(0, 10));
const n = (value: bigint | number | null | undefined) => Number(value ?? 0);

/**
 * Everything "Tổng quan" shows, in one request: traffic and leads per day
 * (with the previous period for comparison), inventory per project, the
 * units people look at (and the ones nobody does), content that needs
 * attention and recent activity. Lead and activity data only reach users
 * allowed to see them. Days are UTC, as unit views are counted.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async summary(days: number, user: AuthUser) {
    const can = (p: string) => user.permissions.includes(p);
    const today = utcDay(new Date());
    const from = new Date(today.getTime() - (days - 1) * DAY);
    const prevFrom = new Date(from.getTime() - days * DAY);
    const tomorrow = new Date(today.getTime() + DAY);
    const leadsAllowed = can(PERMISSIONS.leadsRead);

    const [views, leads, inventory, top, health, projects, posts, jobs, mediaStats, activity, applications, leadBlock] =
      await Promise.all([
        this.prisma.$queryRaw<{ day: Date; views: bigint }[]>`
          SELECT day, sum(views) AS views FROM property_view_days
          WHERE day >= ${prevFrom} AND day < ${tomorrow} GROUP BY day`,
        leadsAllowed
          ? this.prisma.$queryRaw<{ day: Date; leads: bigint }[]>`
              SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS leads FROM leads
              WHERE deleted_at IS NULL AND created_at >= ${prevFrom} AND created_at < ${tomorrow} GROUP BY 1`
          : Promise.resolve([]),
        this.inventory(from),
        this.topUnits(from, leadsAllowed),
        this.health(),
        this.prisma.project.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
        this.posts(),
        this.prisma.jobPosting.findMany({ where: { deletedAt: null, status: 'PUBLISHED' }, select: { deadline: true } }),
        this.media.stats(),
        can(PERMISSIONS.auditRead) ? this.activity() : Promise.resolve(null),
        leadsAllowed ? this.applications() : Promise.resolve(null),
        leadsAllowed ? this.leads(from) : Promise.resolve(null),
      ]);

    // One row per day of the period, the previous period summed for deltas.
    const viewsBy = new Map(views.map((r) => [utcDay(r.day).getTime(), n(r.views)]));
    const leadsBy = new Map(leads.map((r) => [utcDay(r.day).getTime(), n(r.leads)]));
    const series = Array.from({ length: days }, (_, i) => {
      const t = from.getTime() + i * DAY;
      return { day: new Date(t).toISOString().slice(0, 10), views: viewsBy.get(t) ?? 0, leads: leadsBy.get(t) ?? 0 };
    });
    const sumRange = (map: Map<number, number>, start: Date, end: Date) =>
      [...map].reduce((s, [t, v]) => (t >= start.getTime() && t < end.getTime() ? s + v : s), 0);
    const totalViews = sumRange(viewsBy, from, tomorrow);
    const totalLeads = sumRange(leadsBy, from, tomorrow);
    const prevViews = sumRange(viewsBy, prevFrom, from);
    const prevLeads = sumRange(leadsBy, prevFrom, from);
    const todayIso = today.getTime();

    return {
      range: { days, from: series[0].day, to: series.at(-1)!.day },
      traffic: {
        series,
        views: totalViews,
        prevViews,
        leads: leadsAllowed ? totalLeads : null,
        prevLeads: leadsAllowed ? prevLeads : null,
        conversion: leadsAllowed && totalViews ? totalLeads / totalViews : null,
      },
      inventory,
      topUnits: top.hot,
      coldUnits: top.cold,
      coldCount: top.coldCount,
      health: { ...health, unusedMedia: mediaStats.unused, unusedMediaBytes: mediaStats.unusedBytes },
      media: { total: mediaStats.total, bytes: mediaStats.bytes },
      projects: {
        total: projects.reduce((s, r) => s + r._count._all, 0),
        published: projects.find((r) => r.status === 'PUBLISHED')?._count._all ?? 0,
      },
      posts,
      jobs: {
        open: jobs.filter((j) => !j.deadline || j.deadline.getTime() >= todayIso).length,
        expired: jobs.filter((j) => j.deadline && j.deadline.getTime() < todayIso).length,
      },
      leads: leadBlock,
      applications,
      activity,
    };
  }

  /** Units per project and availability, with views in the period. */
  private async inventory(from: Date) {
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; slug: string; availability: string; units: bigint; views: bigint; avg_rent: number | null }[]
    >`
      SELECT p.id, p.name, p.slug, u.availability, count(u.id) AS units,
        coalesce(sum((SELECT sum(v.views) FROM property_view_days v WHERE v.property_id = u.id AND v.day >= ${from})), 0) AS views,
        avg(u.rent_price_vnd) FILTER (WHERE u.for_rent) AS avg_rent
      FROM projects p JOIN properties u ON u.project_id = p.id
      WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL AND u.status <> 'ARCHIVED' AND NOT u.is_demo
      GROUP BY p.id, p.name, p.slug, u.availability`;
    const byProject = new Map<
      string,
      { id: string; name: string; slug: string; total: number; views: number; availability: Record<string, number>; rentSum: number; rentUnits: number }
    >();
    const availability: Record<string, number> = {};
    for (const r of rows) {
      const p = byProject.get(r.id) ?? { id: r.id, name: r.name, slug: r.slug, total: 0, views: 0, availability: {}, rentSum: 0, rentUnits: 0 };
      const count = n(r.units);
      p.total += count;
      p.views += n(r.views);
      p.availability[r.availability] = (p.availability[r.availability] ?? 0) + count;
      if (r.avg_rent) {
        p.rentSum += Number(r.avg_rent) * count;
        p.rentUnits += count;
      }
      availability[r.availability] = (availability[r.availability] ?? 0) + count;
      byProject.set(r.id, p);
    }
    const projects = [...byProject.values()]
      .map(({ rentSum, rentUnits, ...p }) => ({ ...p, avgRent: rentUnits ? Math.round(rentSum / rentUnits) : null }))
      .sort((a, b) => b.total - a.total);
    const total = projects.reduce((s, p) => s + p.total, 0);
    const taken = (availability.RENTED ?? 0) + (availability.SOLD ?? 0) + (availability.RESERVED ?? 0);
    return { total, availability, occupancy: total ? taken / total : 0, projects };
  }

  /** Most viewed units in the period, and available units nobody viewed. */
  private async topUnits(from: Date, withLeads: boolean) {
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; unit_code: string | null; availability: string; status: string; project: string; cover: string | null; views: bigint; leads: bigint }[]
    >`
      SELECT u.id, u.name, u.unit_code, u.availability, u.status, p.name AS project, m.url AS cover,
        coalesce((SELECT sum(v.views) FROM property_view_days v WHERE v.property_id = u.id AND v.day >= ${from}), 0) AS views,
        (SELECT count(*) FROM leads l WHERE l.property_id = u.id AND l.deleted_at IS NULL AND l.created_at >= ${from}) AS leads
      FROM properties u JOIN projects p ON p.id = u.project_id LEFT JOIN media_assets m ON m.id = u.cover_image_id
      WHERE u.deleted_at IS NULL AND u.status <> 'ARCHIVED' AND NOT u.is_demo`;
    const units = rows.map((r) => ({
      id: r.id,
      name: r.name,
      unitCode: r.unit_code,
      project: r.project,
      availability: r.availability,
      published: r.status === 'PUBLISHED',
      cover: r.cover,
      views: n(r.views),
      leads: withLeads ? n(r.leads) : 0,
    }));
    const score = (u: (typeof units)[number]) => u.views + u.leads * 5;
    return {
      hot: units.filter((u) => score(u) > 0).sort((a, b) => score(b) - score(a)).slice(0, 6),
      cold: units.filter((u) => u.published && u.availability === 'AVAILABLE' && !u.views && !u.leads).slice(0, 6),
      coldCount: units.filter((u) => u.published && u.availability === 'AVAILABLE' && !u.views && !u.leads).length,
    };
  }

  /** Content that is incomplete or waiting. */
  private async health() {
    const live = { deletedAt: null, isDemo: false, status: { not: 'ARCHIVED' as const } };
    const [units, noCover, noSeo, shortText, unitDrafts, noPrice] = await Promise.all([
      this.prisma.property.count({ where: live }),
      this.prisma.property.count({ where: { ...live, coverImageId: null } }),
      this.prisma.property.count({ where: { ...live, OR: [{ seoTitle: null }, { seoDescription: null }] } }),
      this.prisma.$queryRaw<{ c: bigint }[]>`
        SELECT count(*) AS c FROM properties WHERE deleted_at IS NULL AND NOT is_demo AND status <> 'ARCHIVED' AND length(description) < 200`,
      this.prisma.property.count({ where: { ...live, status: 'DRAFT' } }),
      this.prisma.property.count({
        where: { ...live, OR: [{ forRent: true, rentPriceVnd: null }, { forSale: true, salePriceVnd: null }] },
      }),
    ]);
    return { units, noCover, noSeo, shortText: n(shortText[0]?.c), unitDrafts, noPrice };
  }

  private async posts() {
    const now = new Date();
    const live = { deletedAt: null };
    const [published, drafts, scheduled] = await Promise.all([
      this.prisma.blogPost.count({ where: { ...live, status: 'PUBLISHED', publishedAt: { lte: now } } }),
      this.prisma.blogPost.count({ where: { ...live, status: 'DRAFT' } }),
      this.prisma.blogPost.count({ where: { ...live, status: 'PUBLISHED', publishedAt: { gt: now } } }),
    ]);
    return { published, drafts, scheduled };
  }

  /** Lead pipeline, sources and the latest requests. */
  private async leads(from: Date) {
    const live = { deletedAt: null };
    const [byStatus, bySource, recent, overdue] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['status'], where: live, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['source'], where: { ...live, createdAt: { gte: from } }, _count: { _all: true } }),
      this.prisma.lead.findMany({
        where: live,
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, name: true, source: true, status: true, priority: true, createdAt: true, property: { select: { name: true } } },
      }),
      this.prisma.lead.count({ where: { ...live, followUpAt: { lt: new Date() }, status: { in: ['NEW', 'CONTACTING'] } } }),
    ]);
    return {
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      bySource: bySource.map((r) => ({ source: r.source, count: r._count._all })).sort((a, b) => b.count - a.count),
      recent,
      overdue,
    };
  }

  private async applications() {
    const [byStatus, recent] = await Promise.all([
      this.prisma.jobApplication.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.jobApplication.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, status: true, createdAt: true, job: { select: { title: true } } },
      }),
    ]);
    return { byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])), recent };
  }

  /** What the team changed lately (sign-ins and AI calls left out), with record names. */
  private async activity() {
    const rows = await this.prisma.auditLog.findMany({
      where: { actorId: { not: null }, NOT: [{ action: { startsWith: 'auth.' } }, { action: { startsWith: 'ai.' } }] },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, actor: { select: { name: true } } },
    });
    const ids = (type: string) => rows.filter((r) => r.entityType === type && r.entityId).map((r) => r.entityId!);
    const uuid = (list: string[]) => list.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const [properties, projects, posts, pages, jobs, banners] = await Promise.all([
      this.prisma.property.findMany({ where: { id: { in: uuid(ids('property')) } }, select: { id: true, name: true } }),
      this.prisma.project.findMany({ where: { id: { in: uuid(ids('project')) } }, select: { id: true, name: true } }),
      this.prisma.blogPost.findMany({ where: { id: { in: uuid(ids('post')) } }, select: { id: true, title: true } }),
      this.prisma.staticPage.findMany({ where: { id: { in: uuid(ids('page')) } }, select: { id: true, title: true } }),
      this.prisma.jobPosting.findMany({ where: { id: { in: uuid(ids('job')) } }, select: { id: true, title: true } }),
      this.prisma.banner.findMany({ where: { id: { in: uuid(ids('banner')) } }, select: { id: true, title: true } }),
    ]);
    const names = new Map<string, string>([
      ...properties.map((r) => [r.id, r.name] as [string, string]),
      ...projects.map((r) => [r.id, r.name] as [string, string]),
      ...[...posts, ...pages, ...jobs, ...banners].map((r) => [r.id, r.title] as [string, string]),
    ]);
    return rows.map((r) => ({ ...r, label: (r.entityId && names.get(r.entityId)) || null }));
  }
}

@ApiTags('admin/dashboard')
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.contentRead)
  async summary(@Query() q: DashboardQuery, @CurrentUser() user: AuthUser) {
    return { data: await this.dashboard.summary(q.days, user) };
  }
}

@Module({ imports: [MediaModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}

import { Global, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../../config/config.service.js';
import { PrismaService } from '../../database/prisma.service.js';

export type IndexedKind = 'property' | 'project' | 'post' | 'page' | 'job';
/** Every page exists in these languages (Vietnamese has no prefix). */
const LOCALE_PREFIXES = ['', '/en', '/ko', '/zh'];
const LOCAL_HOST = /^(localhost|127(\.\d+){3}|\[?::1\]?|.+\.(test|local|localhost))$/i;
/** Changes are sent together a few seconds after the last save. */
const BATCH_MS = 4000;

/**
 * IndexNow: after a unit, project, article, page or job is published,
 * changed or taken down, Bing (and so ChatGPT and Copilot), Naver, Yandex…
 * are told which addresses to read again, in every language. Saves within a
 * few seconds are sent as one request; a failure is only logged. Google does
 * not use IndexNow and keeps reading the sitemap.
 */
@Injectable()
export class IndexNowService implements OnModuleDestroy {
  private readonly logger = new Logger(IndexNowService.name);
  private readonly pending = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private sending: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  private get site() {
    return new URL(this.config.get('SITE_URL'));
  }
  /** Off without an endpoint, and for a local site unless the endpoint is local too (tests). */
  get enabled() {
    const endpoint = this.config.get('INDEXNOW_ENDPOINT');
    if (!endpoint) return false;
    return !LOCAL_HOST.test(this.site.hostname) || LOCAL_HOST.test(new URL(endpoint).hostname);
  }

  /** Queues the public addresses of one record (and of the lists showing it). */
  async changed(kind: IndexedKind, id: string) {
    if (!this.enabled) return;
    try {
      const paths = await this.paths(kind, id);
      if (!paths.length) return;
      for (const path of paths) for (const prefix of LOCALE_PREFIXES) this.pending.add(`${prefix}${path}` || '/');
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush(), BATCH_MS);
    } catch (err) {
      this.logger.warn({ err, kind, id }, 'indexnow: addresses not found');
    }
  }

  /** Sends what is queued now (also used by tests and on shutdown). */
  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending.size) return this.sending;
    const origin = this.site.origin;
    const urlList = [...this.pending].slice(0, 10_000).map((path) => `${origin}${path}`);
    this.pending.clear();
    const key = this.config.get('INDEXNOW_KEY');
    this.sending = fetch(this.config.get('INDEXNOW_ENDPOINT'), {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: this.site.host, key, keyLocation: `${origin}/${key}.txt`, urlList }),
      signal: AbortSignal.timeout(10_000),
    })
      .then((res) => {
        // 200 and 202 both mean received.
        if (res.ok) this.logger.log({ urls: urlList.length }, 'indexnow: sent');
        else this.logger.warn({ status: res.status, urls: urlList.length }, 'indexnow: rejected');
      })
      .catch((err: unknown) => this.logger.warn({ err }, 'indexnow: failed'));
    return this.sending;
  }

  async onModuleDestroy() {
    await this.flush();
  }

  /** Public paths for a record; none while it is a draft that never went live. */
  private async paths(kind: IndexedKind, id: string): Promise<string[]> {
    const gone = (r: { status: string; deletedAt?: Date | null }) => r.status === 'ARCHIVED' || !!r.deletedAt;
    const visible = (r: { status: string; deletedAt?: Date | null }) => r.status === 'PUBLISHED' || gone(r);
    const oldSlugs = async (entityType: 'PROPERTY' | 'PROJECT' | 'POST') =>
      (await this.prisma.slugRedirect.findMany({ where: { entityType, entityId: id }, select: { fromSlug: true } })).map((r) => r.fromSlug);
    switch (kind) {
      case 'property': {
        const u = await this.prisma.property.findUnique({
          where: { id },
          select: { slug: true, status: true, deletedAt: true, isDemo: true, forRent: true, forSale: true, project: { select: { slug: true } } },
        });
        if (!u || u.isDemo || !visible(u)) return [];
        const slugs = [u.slug, ...(await oldSlugs('PROPERTY'))];
        return [
          ...slugs.flatMap((s) => [...(u.forRent ? [`/cho-thue/${s}`] : []), ...(u.forSale ? [`/mua-ban/${s}`] : [])]),
          `/cho-thue/du-an/${u.project.slug}`,
          `/du-an/${u.project.slug}`,
          '/cho-thue',
        ];
      }
      case 'project': {
        const p = await this.prisma.project.findUnique({ where: { id }, select: { slug: true, status: true, deletedAt: true } });
        if (!p || !visible(p)) return [];
        const slugs = [p.slug, ...(await oldSlugs('PROJECT'))];
        return [...slugs.flatMap((s) => [`/du-an/${s}`, `/cho-thue/du-an/${s}`]), '/du-an', ''];
      }
      case 'post': {
        const p = await this.prisma.blogPost.findUnique({ where: { id }, select: { slug: true, status: true, deletedAt: true, publishedAt: true } });
        // A scheduled post is announced by the next save after it goes live.
        if (!p || !visible(p) || (!gone(p) && p.publishedAt && p.publishedAt > new Date())) return [];
        return [...[p.slug, ...(await oldSlugs('POST'))].map((s) => `/blog/${s}`), '/blog'];
      }
      case 'page': {
        const p = await this.prisma.staticPage.findUnique({ where: { id }, select: { path: true, status: true } });
        return p && visible(p) ? [`/${p.path}`] : [];
      }
      case 'job': {
        const j = await this.prisma.jobPosting.findUnique({ where: { id }, select: { slug: true, status: true, deletedAt: true } });
        return j && visible(j) ? [`/tuyen-dung/${j.slug}`, '/tuyen-dung'] : [];
      }
    }
  }
}

@Global()
@Module({ providers: [IndexNowService], exports: [IndexNowService] })
export class IndexNowModule {}

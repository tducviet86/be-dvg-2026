import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { AppConfig } from '../../config/config.service.js';

/** Cache tags understood by FE-DVG's /api/revalidate route. */
export type CacheTag =
  | 'projects'
  | 'properties'
  | 'banners'
  | 'blog'
  | 'pages'
  | 'settings';

/**
 * Tells the frontend to drop cached pages after a successful write. Awaited
 * (max 3 s) so an editor who opens the site right after saving sees the
 * change; a failure is only logged — pages still refresh on their
 * time-based revalidation window.
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name);
  constructor(private readonly config: AppConfig) {}

  async trigger(...tags: CacheTag[]): Promise<void> {
    const url = this.config.get('FRONTEND_REVALIDATE_URL');
    const secret = this.config.get('REVALIDATE_SECRET');
    if (!url || !secret) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags: [...new Set(tags)] }),
      signal: AbortSignal.timeout(3000),
    })
      .then((res) => {
        if (!res.ok) this.logger.warn({ status: res.status, tags }, 'revalidate rejected');
      })
      .catch((err: unknown) => this.logger.warn({ err, tags }, 'revalidate failed'));
  }
}

@Global()
@Module({ providers: [RevalidationService], exports: [RevalidationService] })
export class RevalidationModule {}

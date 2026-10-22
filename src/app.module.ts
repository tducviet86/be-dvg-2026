import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { CoreModule } from './database/database.module.js';
import { AiModule } from './modules/ai/ai.controller.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthGuard } from './modules/auth/auth.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BannersModule } from './modules/banners/banners.module.js';
import { BlogModule } from './modules/blog/blog.module.js';
import { I18nModule } from './modules/i18n/i18n.controller.js';
import { HealthModule } from './modules/health/health.controller.js';
import { LeadsModule } from './modules/leads/leads.controller.js';
import { MediaModule } from './modules/media/media.module.js';
import { PagesModule } from './modules/pages/pages.controller.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { PropertiesModule } from './modules/properties/properties.module.js';
import { RevalidationModule } from './modules/revalidation/revalidation.service.js';
import { SeoModule } from './modules/seo/seo.controller.js';
import { SettingsModule } from './modules/settings/settings.controller.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    CoreModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req, res) => {
          const incoming = req.headers['x-request-id'];
          const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        // Never log credentials, cookies or form bodies (personal data).
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'req.headers["x-csrf-token"]'],
        autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
        transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      // Automated tests disable limits except where a test opts in.
      skipIf: () =>
        process.env.THROTTLE_ENABLED === 'false' ||
        (process.env.NODE_ENV === 'test' && process.env.TEST_THROTTLE !== '1'),
    }),
    AuditModule,
    I18nModule,
    RevalidationModule,
    AuthModule,
    UsersModule,
    MediaModule,
    BannersModule,
    ProjectsModule,
    PropertiesModule,
    BlogModule,
    PagesModule,
    SettingsModule,
    LeadsModule,
    SeoModule,
    HealthModule,
    AiModule,
  ],
  providers: [
    // Order matters: rate limiting runs before authentication.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}

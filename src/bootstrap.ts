import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { AppConfig } from './config/config.service.js';
import { validationError } from './common/validation.js';

/** Shared by main.ts and the e2e tests so both run the same pipeline. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get(AppConfig);
  app.set('trust proxy', config.get('TRUST_PROXY'));
  app.disable('x-powered-by');
  app.setGlobalPrefix('api/v1', { exclude: ['media/*path'] });
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: false } : false,
    }),
  );
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({
    origin: (origin, done) => done(null, !origin || config.get('APP_ORIGINS').includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-request-id', 'authorization'],
    maxAge: 600,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (errors) => validationError(errors),
    }),
  );
  // Local files are served in development even after switching to R2, so
  // images uploaded before the switch keep working.
  if (config.get('STORAGE_DRIVER') === 'local' || config.get('NODE_ENV') !== 'production')
    app.use('/media', express.static(resolve(config.get('LOCAL_MEDIA_DIR')), { immutable: true, maxAge: '365d', index: false, dotfiles: 'deny' }));
  app.enableShutdownHooks();
  return config;
}

export function setupSwagger(app: INestApplication) {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Đất Vàng Group API')
      .setDescription('Public content, lead intake and Admin CMS API. Admin routes authenticate with httpOnly cookies (+ X-CSRF-Token) or a Bearer access token.')
      .setVersion('1.0.0')
      .addCookieAuth('dvg_at')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs/openapi.json' });
}

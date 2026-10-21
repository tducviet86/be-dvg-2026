import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp, setupSwagger } from './bootstrap.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
const config = configureApp(app);
// API docs are public only outside production (or when explicitly enabled).
if (!config.isProduction || process.env.SWAGGER_ENABLED === 'true') setupSwagger(app);
await app.listen(config.get('PORT'), '0.0.0.0');

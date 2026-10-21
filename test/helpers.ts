import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { seedReference } from '../prisma/reference-data.js';

export const PASSWORD = 'Correct-horse-42';

export async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

/** Empties every table (keeps migrations) and re-seeds reference data. */
export async function resetDb(prisma: PrismaService) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await seedReference(prisma);
}

const hash = argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
export async function createUser(prisma: PrismaService, email: string, role: string) {
  const roleRow = await prisma.role.findUniqueOrThrow({ where: { code: role } });
  return prisma.user.create({
    data: { email, name: email.split('@')[0], passwordHash: await hash, roles: { create: { roleId: roleRow.id } } },
  });
}

/** Logs in through the API; returns a cookie-carrying agent plus CSRF token. */
export async function login(app: NestExpressApplication, email: string, password = PASSWORD) {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
  const csrf: string = res.body.data.csrfToken;
  return {
    agent,
    csrf,
    res,
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => agent.post(url).set('x-csrf-token', csrf).send(body),
    patch: (url: string, body?: object) => agent.patch(url).set('x-csrf-token', csrf).send(body),
    put: (url: string, body?: object) => agent.put(url).set('x-csrf-token', csrf).send(body),
    del: (url: string) => agent.delete(url).set('x-csrf-token', csrf),
  };
}

export async function externalMedia(prisma: PrismaService, url = '/images/test.jpg') {
  return prisma.mediaAsset.upsert({ where: { key: url }, create: { storage: 'EXTERNAL', key: url, url, mimeType: 'image/jpeg', alt: 'Ảnh thử' }, update: {} });
}

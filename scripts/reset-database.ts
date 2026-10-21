/**
 * Empties a disposable database (e2e/test) and applies migrations + reference
 * data. Refuses to touch any database whose name does not end in _e2e/_test.
 *   DATABASE_URL=postgresql://…/dvg_e2e npm run db:reset:disposable
 */
import { execFileSync } from 'node:child_process';
import { seedReference } from '../prisma/reference-data.js';
import { prisma } from './db.js';

const url = new URL(process.env.DATABASE_URL ?? '');
const name = url.pathname.slice(1);
if (!/_(e2e|test)$/.test(name) || process.env.NODE_ENV === 'production')
  throw new Error(`Refusing to reset "${name}": only *_e2e / *_test databases.`);
execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', env: process.env });
const tables = await prisma.$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
await seedReference(prisma);
await prisma.$disconnect();
console.log(`Database ${name} reset.`);

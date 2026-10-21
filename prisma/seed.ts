/** Reference data required in every environment (idempotent, no credentials). */
import { prisma } from '../scripts/db.js';
import { seedReference } from './reference-data.js';

await seedReference(prisma).finally(() => prisma.$disconnect());
console.log('Reference data ready.');

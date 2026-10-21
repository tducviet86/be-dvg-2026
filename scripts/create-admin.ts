/**
 * Creates (or resets) an administrator without hard-coded credentials.
 *   ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run admin:create
 * The password is read from the environment of this one command only.
 */
import * as argon2 from 'argon2';
import { prisma } from './db.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.ADMIN_NAME?.trim() || 'Quản trị viên';
const password = process.env.ADMIN_PASSWORD ?? '';
const role = process.env.ADMIN_ROLE ?? 'admin';

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('ADMIN_EMAIL is required');
if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
  throw new Error('ADMIN_PASSWORD must be >= 12 chars and contain letters and digits');

const roleRow = await prisma.role.findUnique({ where: { code: role } });
if (!roleRow) throw new Error(`Role "${role}" not found — run the seed first (npm run db:seed).`);
const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
const user = await prisma.user.upsert({
  where: { email },
  create: { email, name, passwordHash, roles: { create: { roleId: roleRow.id } } },
  update: { passwordHash, status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null },
});
await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: roleRow.id } }, create: { userId: user.id, roleId: roleRow.id }, update: {} });
await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
await prisma.auditLog.create({ data: { action: 'user.bootstrap', entityType: 'user', entityId: user.id, changes: { email, role } } });
console.log(`User ${email} ready with role ${role}.`);
await prisma.$disconnect();

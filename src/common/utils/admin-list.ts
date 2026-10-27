import type { PrismaService } from '../../database/prisma.service.js';

/** Who created a record and who changed it last (from the audit log). */
export type Editors = { createdBy: string | null; updatedBy: string | null };

/**
 * Names of who created and last changed each record, read from the audit
 * log (`<prefix>.create` / `<prefix>.update`). Seeded records have none.
 */
export async function editorsOf(prisma: PrismaService, entityType: string, prefix: string, ids: string[]): Promise<Map<string, Editors>> {
  const result = new Map<string, Editors>();
  if (!ids.length) return result;
  const logs = await prisma.auditLog.findMany({
    where: { entityType, entityId: { in: ids }, action: { in: [`${prefix}.create`, `${prefix}.update`] } },
    select: { entityId: true, action: true, actor: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  for (const log of logs) {
    const entry = result.get(log.entityId!) ?? { createdBy: null, updatedBy: null };
    const name = log.actor?.name ?? null;
    if (log.action === `${prefix}.create`) entry.createdBy = name;
    entry.updatedBy = name;
    result.set(log.entityId!, entry);
  }
  return result;
}

/** `{ DRAFT: 3, PUBLISHED: 10 }` from a `groupBy(['status'])` result. */
export const statusCounts = (rows: { status: string; _count: { _all: number } }[]) =>
  Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<string, number>;

/** Sorts every admin list offers besides its own default order. */
export const ADMIN_SORTS = ['default', 'created', 'updated', 'name'] as const;
export type AdminSort = (typeof ADMIN_SORTS)[number];

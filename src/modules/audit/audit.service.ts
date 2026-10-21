import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type AuditEntry = {
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  changes?: Prisma.InputJsonValue;
  ip?: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Writes inside the caller's transaction when `tx` is given. */
  async log(entry: AuditEntry, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    try {
      await client.auditLog.create({ data: entry });
    } catch (error) {
      if (tx) throw error;
      this.logger.error({ err: error, action: entry.action }, 'audit failed');
    }
  }
}

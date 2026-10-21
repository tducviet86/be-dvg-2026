import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { RequirePermissions } from '../../common/decorators/auth.decorators.js';
import { PaginationQuery, pageMeta } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PERMISSIONS } from '../auth/permissions.js';

class AuditQuery extends PaginationQuery {
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() action?: string;
}

@ApiTags('admin/audit')
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.auditRead)
  async list(@Query() q: AuditQuery) {
    const where = {
      entityType: q.entityType,
      entityId: q.entityId,
      action: q.action ? { startsWith: q.action } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data: rows, meta: pageMeta(q.page, q.pageSize, total) };
  }
}

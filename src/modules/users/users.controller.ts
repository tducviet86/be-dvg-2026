import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/auth.decorators.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { UserStatus } from '../../generated/prisma/enums.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';

export const PASSWORD_MIN = 12;

class CreateUserDto {
  @IsEmail() @MaxLength(160) email: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsString() @MinLength(PASSWORD_MIN) @MaxLength(200) password: string;
  @IsArray() @ArrayUnique() @IsString({ each: true }) roles: string[];
}
class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) roles?: string[];
  @IsOptional() @IsString() @MinLength(PASSWORD_MIN) @MaxLength(200) password?: string;
}

const select = {
  id: true,
  email: true,
  name: true,
  status: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  roles: { select: { role: { select: { code: true, name: true } } } },
} as const;

@ApiTags('admin/users')
@Controller('admin/users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.usersManage)
  async list() {
    return { data: await this.prisma.user.findMany({ select, orderBy: { createdAt: 'asc' } }) };
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.usersManage)
  async roles() {
    return { data: await this.prisma.role.findMany({ select: { code: true, name: true, description: true } }) };
  }

  /** Staff that leads can be assigned to. */
  @Get('assignable')
  @RequirePermissions(PERMISSIONS.leadsRead)
  async assignable() {
    return {
      data: await this.prisma.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.usersManage)
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    const roles = await this.resolveRoles(dto.roles);
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } }))
      throw conflict('Email đã được sử dụng.');
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash: await this.auth.hashPassword(dto.password),
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      select,
    });
    await this.audit.log({ actorId: actor.id, action: 'user.create', entityType: 'user', entityId: user.id, changes: { email, roles: dto.roles } });
    return { data: user };
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.usersManage)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw notFound();
    if (id === actor.id && (dto.status === 'DISABLED' || (dto.roles && !dto.roles.includes('admin') && actor.roles.includes('admin'))))
      throw badRequest('Không thể tự khóa hoặc tự gỡ quyền quản trị của chính mình.');
    const roles = dto.roles ? await this.resolveRoles(dto.roles) : null;
    const user = await this.prisma.$transaction(async (tx) => {
      if (roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) });
      }
      const updated = await tx.user.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          status: dto.status,
          passwordHash: dto.password ? await this.auth.hashPassword(dto.password) : undefined,
          ...(dto.password || dto.status === 'ACTIVE' ? { failedLoginCount: 0, lockedUntil: null } : {}),
        },
        select,
      });
      // Disabling a user or resetting a password ends existing sessions.
      if (dto.status === 'DISABLED' || dto.password || roles)
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ actorId: actor.id, action: 'user.update', entityType: 'user', entityId: id, changes: { name: dto.name, status: dto.status, roles: dto.roles, passwordReset: !!dto.password } }, tx);
      return updated;
    });
    return { data: user };
  }

  private async resolveRoles(codes: string[]) {
    if (!codes.length) throw badRequest('Người dùng cần ít nhất một vai trò.');
    const roles = await this.prisma.role.findMany({ where: { code: { in: codes } } });
    if (roles.length !== codes.length) throw badRequest('Vai trò không hợp lệ.');
    return roles;
  }
}

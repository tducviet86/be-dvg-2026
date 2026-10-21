import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CurrentUser,
  Public,
  RequirePermissions,
} from '../../common/decorators/auth.decorators.js';
import { Clean } from '../../common/dto/fields.js';
import { notFound } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { BannerType } from '../../generated/prisma/enums.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';
import { BannersService } from './banners.service.js';

export class BannerContentDto {
  @IsOptional() @Clean() @IsString() @MaxLength(40) label?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(120) title?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(240) description?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(200) imageAlt?: string | null;
  @IsOptional() @IsUUID() imageId?: string | null;
  @IsOptional() @IsUUID() mobileImageId?: string | null;
  @IsOptional() @IsBoolean() useProjectImage?: boolean;
  @IsOptional() @IsInt() @Min(1) position?: number;
}
class CreateBannerDto extends BannerContentDto {
  @IsEnum(BannerType) type: BannerType;
  @IsOptional() @IsUUID() projectId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class UpdateBannerDto extends BannerContentDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
}

@ApiTags('banners')
@Controller()
export class BannersController {
  constructor(
    private readonly banners: BannersService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  @Public()
  @Get('banners')
  async publicList() {
    return { data: await this.banners.publicList() };
  }

  @Get('admin/banners')
  @RequirePermissions(PERMISSIONS.contentRead)
  async list() {
    return { data: await this.banners.adminList() };
  }

  @Get('admin/banners/:id')
  @RequirePermissions(PERMISSIONS.contentRead)
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.banners.get(id) };
  }

  @Post('admin/banners')
  @RequirePermissions(PERMISSIONS.bannersWrite)
  async create(@Body() dto: CreateBannerDto, @CurrentUser() user: AuthUser) {
    const banner = await this.prisma.$transaction(async (tx) => {
      const created = await this.banners.create(tx, dto);
      await this.audit.log({ actorId: user.id, action: 'banner.create', entityType: 'banner', entityId: created.id, changes: { ...dto } }, tx);
      return created;
    });
    await this.revalidation.trigger('banners');
    return { data: await this.banners.get(banner.id) };
  }

  @Patch('admin/banners/:id')
  @RequirePermissions(PERMISSIONS.bannersWrite)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBannerDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.banners.update(tx, id, dto);
      await this.audit.log({ actorId: user.id, action: 'banner.update', entityType: 'banner', entityId: id, changes: { ...dto } }, tx);
    });
    await this.revalidation.trigger('banners');
    return { data: await this.banners.get(id) };
  }

  @Delete('admin/banners/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.bannersWrite)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.banner.findUnique({ where: { id } });
      if (!existing) throw notFound('Không tìm thấy banner.');
      await tx.banner.delete({ where: { id } });
      await this.banners.renumber(tx);
      await this.audit.log({ actorId: user.id, action: 'banner.delete', entityType: 'banner', entityId: id, changes: { projectId: existing.projectId } }, tx);
    });
    await this.revalidation.trigger('banners');
  }
}

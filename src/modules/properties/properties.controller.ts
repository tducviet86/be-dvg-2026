import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { AdminPropertyQuery, CreatePropertyDto, PublicPropertyQuery, UpdatePropertyDto } from './properties.dto.js';
import { PropertiesService } from './properties.service.js';

@ApiTags('properties')
@Controller()
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Public()
  @Get('properties')
  list(@Query() q: PublicPropertyQuery) {
    return this.properties.publicList(q);
  }

  @Public()
  @Get('property-types')
  async types() {
    return { data: await this.properties.types() };
  }

  @Public()
  @Get('properties/:slug')
  async get(@Param('slug') slug: string) {
    return { data: await this.properties.publicBySlug(slug) };
  }

  @Get('admin/properties')
  @RequirePermissions(PERMISSIONS.contentRead)
  adminList(@Query() q: AdminPropertyQuery) {
    return this.properties.adminList(q);
  }

  @Get('admin/properties/preview/:slug')
  @RequirePermissions(PERMISSIONS.contentRead)
  async preview(@Param('slug') slug: string) {
    return { data: await this.properties.previewBySlug(slug) };
  }

  @Get('admin/properties/:id')
  @RequirePermissions(PERMISSIONS.contentRead)
  async adminGet(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.properties.adminGet(id) };
  }

  @Post('admin/properties')
  @RequirePermissions(PERMISSIONS.propertiesWrite)
  async create(@Body() dto: CreatePropertyDto, @CurrentUser() user: AuthUser) {
    return { data: await this.properties.create(dto, user) };
  }

  @Patch('admin/properties/:id')
  @RequirePermissions(PERMISSIONS.propertiesWrite)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePropertyDto, @CurrentUser() user: AuthUser) {
    return { data: await this.properties.update(id, dto, user) };
  }

  @Delete('admin/properties/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.propertiesWrite)
  async archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.properties.archive(id, user);
  }
}

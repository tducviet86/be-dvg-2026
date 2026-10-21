import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { AdminProjectQuery, CreateProjectDto, PublicProjectQuery, UpdateProjectDto } from './projects.dto.js';
import { ProjectsService } from './projects.service.js';

@ApiTags('projects')
@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Public()
  @Get('projects')
  list(@Query() q: PublicProjectQuery) {
    return this.projects.publicList(q);
  }

  @Public()
  @Get('project-categories')
  async categories() {
    return { data: await this.projects.categories() };
  }

  @Public()
  @Get('projects/:slug')
  async get(@Param('slug') slug: string) {
    return { data: await this.projects.publicBySlug(slug) };
  }

  @Get('admin/projects')
  @RequirePermissions(PERMISSIONS.contentRead)
  adminList(@Query() q: AdminProjectQuery) {
    return this.projects.adminList(q);
  }

  @Get('admin/projects/preview/:slug')
  @RequirePermissions(PERMISSIONS.contentRead)
  async preview(@Param('slug') slug: string) {
    return { data: await this.projects.previewBySlug(slug) };
  }

  @Get('admin/projects/:id')
  @RequirePermissions(PERMISSIONS.contentRead)
  async adminGet(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.projects.adminGet(id) };
  }

  @Post('admin/projects')
  @RequirePermissions(PERMISSIONS.projectsWrite)
  async create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUser) {
    return { data: await this.projects.create(dto, user) };
  }

  @Patch('admin/projects/:id')
  @RequirePermissions(PERMISSIONS.projectsWrite)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto, @CurrentUser() user: AuthUser) {
    return { data: await this.projects.update(id, dto, user) };
  }

  @Delete('admin/projects/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.projectsWrite)
  async archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.projects.archive(id, user);
  }
}

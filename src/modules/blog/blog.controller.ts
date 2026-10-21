import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { AdminPostQuery, CategoryDto, CreatePostDto, PublicPostQuery, UpdatePostDto } from './blog.dto.js';
import { BlogService } from './blog.service.js';

@ApiTags('blog')
@Controller()
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Public() @Get('blog')
  list(@Query() q: PublicPostQuery) {
    return this.blog.publicList(q);
  }
  @Public() @Get('blog/categories')
  async categories() {
    return { data: await this.blog.publicCategories() };
  }
  @Public() @Get('blog/:slug')
  async get(@Param('slug') slug: string) {
    return { data: await this.blog.publicBySlug(slug) };
  }

  @Get('admin/blog/posts') @RequirePermissions(PERMISSIONS.contentRead)
  adminList(@Query() q: AdminPostQuery) {
    return this.blog.adminList(q);
  }
  @Get('admin/blog/posts/preview/:slug') @RequirePermissions(PERMISSIONS.contentRead)
  async preview(@Param('slug') slug: string) {
    return { data: await this.blog.previewBySlug(slug) };
  }
  @Get('admin/blog/posts/:id') @RequirePermissions(PERMISSIONS.contentRead)
  async adminGet(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.blog.adminGet(id) };
  }
  @Post('admin/blog/posts') @RequirePermissions(PERMISSIONS.blogWrite)
  async create(@Body() dto: CreatePostDto, @CurrentUser() user: AuthUser) {
    return { data: await this.blog.create(dto, user) };
  }
  @Patch('admin/blog/posts/:id') @RequirePermissions(PERMISSIONS.blogWrite)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePostDto, @CurrentUser() user: AuthUser) {
    return { data: await this.blog.update(id, dto, user) };
  }
  @Delete('admin/blog/posts/:id') @HttpCode(HttpStatus.NO_CONTENT) @RequirePermissions(PERMISSIONS.blogWrite)
  async archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.blog.archive(id, user);
  }

  @Get('admin/blog/categories') @RequirePermissions(PERMISSIONS.contentRead)
  async adminCategories() {
    return { data: await this.blog.categories() };
  }
  @Post('admin/blog/categories') @RequirePermissions(PERMISSIONS.blogWrite)
  async createCategory(@Body() dto: CategoryDto, @CurrentUser() user: AuthUser) {
    return { data: await this.blog.saveCategory(dto, null, user) };
  }
  @Patch('admin/blog/categories/:id') @RequirePermissions(PERMISSIONS.blogWrite)
  async updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CategoryDto, @CurrentUser() user: AuthUser) {
    return { data: await this.blog.saveCategory(dto, id, user) };
  }
  @Delete('admin/blog/categories/:id') @HttpCode(HttpStatus.NO_CONTENT) @RequirePermissions(PERMISSIONS.blogWrite)
  async deleteCategory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.blog.deleteCategory(id, user);
  }
}

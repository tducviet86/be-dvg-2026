import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { AdminJobQuery, ApplicationQuery, ApplyDto, CreateJobDto, PublicJobQuery, UpdateApplicationDto, UpdateJobDto } from './jobs.dto.js';
import { JobsService, MAX_CV_BYTES } from './jobs.service.js';

@ApiTags('jobs')
@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Public()
  @Get('jobs')
  list(@Query() q: PublicJobQuery) {
    return this.jobs.publicList(q);
  }

  @Public()
  @Get('jobs/:slug')
  async get(@Param('slug') slug: string) {
    return { data: await this.jobs.publicBySlug(slug) };
  }

  /** Multipart: form fields + "cv" (PDF/DOC/DOCX, ≤ 5 MB). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post('jobs/apply')
  @HttpCode(HttpStatus.ACCEPTED)
  // A larger file is refused by the service with a clear message, not cut here.
  @UseInterceptors(FileInterceptor('cv', { storage: memoryStorage(), limits: { fileSize: MAX_CV_BYTES + 1, files: 1, fields: 20 } }))
  async apply(@Body() dto: ApplyDto, @UploadedFile() cv: Express.Multer.File | undefined, @Req() req: Request) {
    await this.jobs.apply(dto, cv, { ip: req.ip, userAgent: req.header('user-agent') });
    return { data: { received: true } };
  }

  @Get('admin/jobs')
  @RequirePermissions(PERMISSIONS.contentRead)
  adminList(@Query() q: AdminJobQuery) {
    return this.jobs.adminList(q);
  }

  @Get('admin/jobs/:id')
  @RequirePermissions(PERMISSIONS.contentRead)
  async adminGet(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.jobs.adminGet(id) };
  }

  @Post('admin/jobs')
  @RequirePermissions(PERMISSIONS.pagesWrite)
  async create(@Body() dto: CreateJobDto, @CurrentUser() user: AuthUser) {
    return { data: await this.jobs.create(dto, user) };
  }

  @Patch('admin/jobs/:id')
  @RequirePermissions(PERMISSIONS.pagesWrite)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobDto, @CurrentUser() user: AuthUser) {
    return { data: await this.jobs.update(id, dto, user) };
  }

  @Delete('admin/jobs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.pagesWrite)
  async archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.jobs.archive(id, user);
  }

  @Get('admin/job-applications')
  @RequirePermissions(PERMISSIONS.leadsRead)
  applications(@Query() q: ApplicationQuery) {
    return this.jobs.applications(q);
  }

  @Patch('admin/job-applications/:id')
  @RequirePermissions(PERMISSIONS.leadsWrite)
  async updateApplication(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateApplicationDto, @CurrentUser() user: AuthUser) {
    return { data: await this.jobs.updateApplication(id, dto, user) };
  }

  /** Always a download (never rendered by the browser). */
  @Get('admin/job-applications/:id/cv')
  @RequirePermissions(PERMISSIONS.leadsRead)
  async cv(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const file = await this.jobs.cv(id, user);
    const name = file.cvName ?? 'cv';
    res.setHeader('Content-Type', file.cvMime ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(Buffer.from(file.cvData!));
  }

  @Delete('admin/job-applications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.leadsWrite)
  async removeApplication(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.jobs.removeApplication(id, user);
  }
}

@Module({ controllers: [JobsController], providers: [JobsService] })
export class JobsModule {}

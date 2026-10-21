import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { CreateLeadDto, InquiryDto, LeadQuery, NewsletterDto, PublicFormDto, UpdateLeadDto } from './leads.dto.js';
import { LeadsService } from './leads.service.js';

const ctx = (req: Request) => ({ ip: req.ip, userAgent: req.header('user-agent') });
const FORM_LIMIT = { default: { limit: 5, ttl: 600_000 } };

@ApiTags('leads')
@Controller()
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Public() @Throttle(FORM_LIMIT) @Post('contact') @HttpCode(HttpStatus.ACCEPTED)
  async contact(@Body() dto: PublicFormDto, @Req() req: Request) {
    await this.leads.submit('CONTACT', dto, ctx(req));
    return { data: { received: true } };
  }

  @Public() @Throttle(FORM_LIMIT) @Post('inquiries') @HttpCode(HttpStatus.ACCEPTED)
  async inquiry(@Body() dto: InquiryDto, @Req() req: Request) {
    await this.leads.submit('INQUIRY', dto, ctx(req));
    return { data: { received: true } };
  }

  @Public() @Throttle(FORM_LIMIT) @Post('newsletter') @HttpCode(HttpStatus.ACCEPTED)
  async newsletter(@Body() dto: NewsletterDto) {
    await this.leads.subscribe(dto);
    return { data: { received: true } };
  }

  @Get('admin/leads') @RequirePermissions(PERMISSIONS.leadsRead)
  list(@Query() q: LeadQuery, @CurrentUser() user: AuthUser) {
    return this.leads.list(q, user);
  }

  @Get('admin/leads/export') @RequirePermissions(PERMISSIONS.leadsExport)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="khach-hang.csv"')
  @Header('Cache-Control', 'no-store')
  export(@Query() q: LeadQuery, @CurrentUser() user: AuthUser) {
    return this.leads.exportCsv({ ...q, page: 1, pageSize: 100 }, user);
  }

  @Post('admin/leads') @RequirePermissions(PERMISSIONS.leadsWrite)
  async create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthUser) {
    return { data: await this.leads.createManual(dto, user) };
  }

  @Get('admin/leads/:id') @RequirePermissions(PERMISSIONS.leadsRead)
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return { data: await this.leads.get(id, user) };
  }

  @Patch('admin/leads/:id') @RequirePermissions(PERMISSIONS.leadsWrite)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: AuthUser) {
    return { data: await this.leads.update(id, dto, user) };
  }

  @Delete('admin/leads/:id') @HttpCode(HttpStatus.NO_CONTENT) @RequirePermissions(PERMISSIONS.leadsWrite, PERMISSIONS.leadsExport)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.leads.remove(id, user);
  }
}

@Module({ controllers: [LeadsController], providers: [LeadsService] })
export class LeadsModule {}

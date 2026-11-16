import { Body, Controller, Headers, HttpCode, HttpStatus, Injectable, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../../common/decorators/auth.decorators.js';
import { PrismaService } from '../../database/prisma.service.js';
import { BOT, VIEW_SOURCES } from '../properties/properties.service.js';

export const CLICK_KINDS = ['call', 'zalo', 'whatsapp'] as const;

class ContactClickDto {
  @IsIn(CLICK_KINDS) kind: (typeof CLICK_KINDS)[number];
  /** The visit's source (as for unit views); anything else is "other". */
  @IsOptional() @IsString() @MaxLength(16) source?: string;
  /** The page the link was tapped on. */
  @IsString() @MaxLength(300) path: string;
  /** The unit's slug, on a unit page. */
  @IsOptional() @IsString() @MaxLength(200) unit?: string;
  /** The number or address tapped (tel:…, zalo.me/…). */
  @IsOptional() @IsString() @MaxLength(64) target?: string;
}

/** Records taps on call, Zalo and WhatsApp links (crawlers left out). */
@Injectable()
export class ContactClicksService {
  constructor(private readonly prisma: PrismaService) {}

  async record(dto: ContactClickDto, userAgent = '') {
    if (!userAgent || BOT.test(userAgent)) return;
    const unit = dto.unit
      ? await this.prisma.property.findFirst({ where: { slug: dto.unit, deletedAt: null }, select: { id: true } })
      : null;
    await this.prisma.contactClick.create({
      data: {
        kind: dto.kind,
        source: (VIEW_SOURCES as readonly string[]).includes(dto.source ?? '') ? dto.source! : 'other',
        path: dto.path.startsWith('/') ? dto.path : '/',
        target: dto.target?.replace(/^tel:/, '') || null,
        propertyId: unit?.id ?? null,
      },
    });
  }
}

@Controller()
export class ContactClicksController {
  constructor(private readonly clicks: ContactClicksService) {}

  /** Sent by the site when a visitor taps a call, Zalo or WhatsApp link. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('contact-clicks')
  @HttpCode(HttpStatus.NO_CONTENT)
  async record(@Body() dto: ContactClickDto, @Headers('user-agent') userAgent?: string) {
    await this.clicks.record(dto, userAgent);
  }
}

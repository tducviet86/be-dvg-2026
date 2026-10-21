import { Type } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { Clean } from '../../common/dto/fields.js';
import { PaginationQuery } from '../../common/dto/pagination.dto.js';
import { LeadKind, LeadPriority, LeadStatus } from '../../generated/prisma/enums.js';

/** Fields shared by every public form, including anti-spam signals. */
export class PublicFormDto {
  @Clean() @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsEmail() @MaxLength(120) email: string;
  @IsOptional() @Matches(/^(0|\+84)(3|5|7|8|9)\d{8}$/, { message: 'Số di động Việt Nam không hợp lệ.' }) phone?: string;
  @Clean() @IsString() @MinLength(10) @MaxLength(1500) message: string;
  @IsOptional() @Clean() @IsString() @MaxLength(80) source?: string;
  @IsOptional() @Clean() @IsString() @MaxLength(120) intent?: string;
  @IsBoolean() @Equals(true, { message: 'Bạn cần đồng ý để chúng tôi liên hệ.' }) consent: boolean;
  /** Honeypot: hidden input that humans leave empty. */
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  /** Milliseconds since the form was rendered (bots submit instantly). */
  @IsOptional() @Type(() => Number) @IsInt() elapsedMs?: number;
}
export class InquiryDto extends PublicFormDto {
  @IsOptional() @IsString() @MaxLength(160) projectSlug?: string;
  @IsOptional() @IsString() @MaxLength(160) propertySlug?: string;
}
export class NewsletterDto {
  @IsEmail() @MaxLength(120) email: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}

export class LeadQuery extends PaginationQuery {
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsEnum(LeadKind) kind?: LeadKind;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
export class UpdateLeadDto {
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsEnum(LeadPriority) priority?: LeadPriority;
  @IsOptional() @IsUUID() assigneeId?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(4000) notes?: string | null;
  @IsOptional() @IsISO8601() followUpAt?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(120) company?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(120) position?: string | null;
  @IsOptional() @Matches(/^\d{1,15}$/) budgetMinVnd?: string | null;
  @IsOptional() @Matches(/^\d{1,15}$/) budgetMaxVnd?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(160) preferredLocation?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(40) preferredContact?: string | null;
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
}

/** Manual entry by staff (phone call, walk-in). */
export class CreateLeadDto {
  @IsEnum(LeadKind) kind: LeadKind;
  @Clean() @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsEmail() @MaxLength(120) email: string;
  @IsOptional() @Matches(/^\+?[\d\s().-]{8,20}$/, { message: 'Số điện thoại không hợp lệ.' }) phone?: string | null;
  @Clean() @IsString() @MinLength(10) @MaxLength(1500) message: string;
  @Clean() @IsString() @MinLength(2) @MaxLength(80) source: string;
  @IsOptional() @Clean() @IsString() @MaxLength(120) intent?: string | null;
}

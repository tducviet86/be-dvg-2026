import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Clean } from '../../common/dto/fields.js';
import { PaginationQuery } from '../../common/dto/pagination.dto.js';
import { SLUG_PATTERN } from '../../common/utils/text.js';
import { ApplicationStatus, EmploymentType, PublishStatus } from '../../generated/prisma/enums.js';

const VND = /^\d{1,15}$/;
const VND_MESSAGE = 'Số tiền phải là số nguyên VND không âm.';

export class CreateJobDto {
  @IsString() @Matches(SLUG_PATTERN, { message: 'Đường dẫn không hợp lệ.' }) @MaxLength(160) slug: string;
  @Clean() @IsString() @MinLength(2) @MaxLength(160) title: string;
  @Clean() @IsString() @MinLength(2) @MaxLength(80) department: string;
  @Clean() @IsString() @MinLength(2) @MaxLength(160) location: string;
  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @IsOptional() @Matches(VND, { message: VND_MESSAGE }) salaryMinVnd?: string | null;
  @IsOptional() @Matches(VND, { message: VND_MESSAGE }) salaryMaxVnd?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(120) salaryNote?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(999) openings?: number | null;
  @IsOptional() @IsISO8601({ strict: true }) deadline?: string | null;
  @Clean() @IsString() @MinLength(10) @MaxLength(400) summary: string;
  @Clean() @IsString() @MinLength(10) @MaxLength(8000) description: string;
  @Clean() @IsString() @MinLength(5) @MaxLength(8000) requirements: string;
  @Clean() @IsString() @MinLength(5) @MaxLength(8000) benefits: string;
  @IsOptional() @IsEnum(PublishStatus) status?: PublishStatus;
  @IsOptional() @Clean() @IsString() @MaxLength(120) seoTitle?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(320) seoDescription?: string | null;
}
export class UpdateJobDto extends PartialType(CreateJobDto) {
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
}

export class PublicJobQuery extends PaginationQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(80) department?: string;
  @IsOptional() @IsEnum(EmploymentType) type?: EmploymentType;
}
export class AdminJobQuery extends PaginationQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsEnum(PublishStatus) status?: PublishStatus;
}

/** Multipart form fields arrive as strings. */
const bool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === 'on';
export class ApplyDto {
  /** Empty = general application ("Ứng tuyển chung"). */
  @IsOptional() @IsString() @MaxLength(160) jobSlug?: string;
  @Clean() @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsEmail({}, { message: 'Email không hợp lệ.' }) @MaxLength(120) email: string;
  @Matches(/^(0|\+84)(3|5|7|8|9)\d{8}$/, { message: 'Số di động Việt Nam không hợp lệ.' }) phone: string;
  @IsOptional() @Clean() @IsString() @MaxLength(2000) message?: string;
  @Transform(bool) @IsBoolean() @Equals(true, { message: 'Bạn cần đồng ý để chúng tôi lưu hồ sơ.' }) consent: boolean;
  /** Honeypot: hidden input that humans leave empty. */
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsOptional() @Type(() => Number) @IsInt() elapsedMs?: number;
}

export class ApplicationQuery extends PaginationQuery {
  @IsOptional() @IsUUID() jobId?: string;
  @IsOptional() @IsEnum(ApplicationStatus) status?: ApplicationStatus;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
export class UpdateApplicationDto {
  @IsOptional() @IsEnum(ApplicationStatus) status?: ApplicationStatus;
  @IsOptional() @Clean() @IsString() @MaxLength(4000) notes?: string | null;
}

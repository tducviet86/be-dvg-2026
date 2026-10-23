import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Clean, CleanList } from '../../common/dto/fields.js';
import { PaginationQuery } from '../../common/dto/pagination.dto.js';
import { SLUG_PATTERN } from '../../common/utils/text.js';
import { ProjectStage, PublishStatus } from '../../generated/prisma/enums.js';
import { BannerContentDto } from '../banners/banners.controller.js';

const SLUG_MESSAGE =
  'Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang.';

export class HighlightDto {
  @Clean() @IsString() @MinLength(2) @MaxLength(120) title: string;
  @Clean() @IsString() @MinLength(2) @MaxLength(400) text: string;
}
export class ProjectBannerDto extends BannerContentDto {
  @IsBoolean() enabled: boolean;
  /** updatedAt of the banner as loaded by the form (conflict detection). */
  @IsOptional() @IsISO8601() expectedBannerUpdatedAt?: string;
}

export class CreateProjectDto {
  @IsString() @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE }) @MaxLength(120) slug: string;
  @Clean() @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsOptional() @IsEnum(ProjectStage) stage?: ProjectStage;
  @IsOptional() @IsEnum(PublishStatus) status?: PublishStatus;
  @IsOptional() @IsISO8601() publishedAt?: string;
  @IsArray() @ArrayUnique() @IsString({ each: true }) categories: string[];
  @IsOptional() @Clean() @IsString() @MaxLength(120) propertyKind?: string | null;
  @Clean() @IsString() @MinLength(2) @MaxLength(160) location: string;
  @IsOptional() @Clean() @IsString() @MaxLength(300) address?: string | null;
  @Clean() @IsString() @MinLength(10) @MaxLength(600) intro: string;
  @IsOptional() @CleanList() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(4000, { each: true }) overview?: string[];
  @IsOptional() @CleanList() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(160, { each: true }) products?: string[];
  @IsOptional() @Clean() @IsString() @MaxLength(200) developer?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(200) companyRole?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(600) legalStatus?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) totalAreaM2?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) totalUnits?: number | null;
  @IsOptional() @IsISO8601({ strict: true }) startDate?: string | null;
  @IsOptional() @IsISO8601({ strict: true }) handoverDate?: string | null;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) mapUrl?: string | null;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, host_whitelist: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com'] }, { message: 'Nhập đường dẫn trang Facebook (https://www.facebook.com/…).' })
  facebookUrl?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(200) mapLabel?: string | null;
  @IsOptional() @IsLatitude() latitude?: number | null;
  @IsOptional() @IsLongitude() longitude?: number | null;
  @IsOptional() @IsUUID() coverImageId?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(300) coverImageAlt?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(120) imageCredit?: string | null;
  @IsOptional() @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) sourceUrl?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(800) rentalIntro?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(200) rentalFocus?: string | null;
  @IsOptional() @CleanList() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(300, { each: true }) rentalChecks?: string[];
  @IsOptional() @Clean() @IsString() @MaxLength(120) seoTitle?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(320) seoDescription?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @CleanList() @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) @MaxLength(160, { each: true }) amenities?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => HighlightDto) highlights?: HighlightDto[];
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(60) @IsUUID('all', { each: true }) galleryImageIds?: string[];
  @IsOptional() @ValidateNested() @Type(() => ProjectBannerDto) banner?: ProjectBannerDto;
}
export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
}

export class PublicProjectQuery extends PaginationQuery {
  @IsOptional() @IsString() category?: string;
}
export class AdminProjectQuery extends PaginationQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(PublishStatus) status?: PublishStatus;
  @IsOptional() @IsString() category?: string;
}

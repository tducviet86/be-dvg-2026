import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn, IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ADMIN_SORTS, type AdminSort } from '../../common/utils/admin-list.js';
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
export class UnitTypeDto {
  @Clean() @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @Clean() @IsString() @MaxLength(60) area?: string;
  @IsOptional() @Clean() @IsString() @MaxLength(60) price?: string;
  @IsOptional() @Clean() @IsString() @MaxLength(200) note?: string;
  /** URL of a library image. */
  @IsOptional() @IsString() @MaxLength(1000) image?: string;
}
export class FloorPlanDto {
  @Clean() @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @Clean() @IsString() @MaxLength(40) tower?: string;
  @IsString() @MinLength(1) @MaxLength(1000) image: string;
}
export class PaymentStepDto {
  @Clean() @IsString() @MinLength(2) @MaxLength(120) label: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100) percent: number;
  @IsOptional() @Clean() @IsString() @MaxLength(160) timing?: string;
}
export class TowerDto {
  @Clean() @IsString() @MinLength(1) @MaxLength(40) name: string;
  @IsOptional() @Clean() @IsString() @MaxLength(60) status?: string;
  /** Only when it differs from the project's handover date. */
  @IsOptional() @Clean() @IsString() @MaxLength(80) handover?: string;
  @IsOptional() @Clean() @IsString() @MaxLength(200) note?: string;
}
export class ProjectPhotoDto {
  @IsIn(['Phối cảnh', 'Căn hộ mẫu', 'Căn 1 phòng ngủ', 'Căn 2 phòng ngủ', 'Căn 3 phòng ngủ', 'Tiện ích']) group: string;
  @IsString() @MinLength(1) @MaxLength(1000) image: string;
}
export class SalesPolicyDto {
  @Clean() @IsString() @MinLength(2) @MaxLength(160) title: string;
  @IsOptional() @Clean() @IsString() @MaxLength(1000) body?: string;
  @IsOptional() @Clean() @IsString() @MaxLength(300) condition?: string;
}
export class ConnectionDto {
  @Clean() @IsString() @MinLength(2) @MaxLength(160) place: string;
  @IsOptional() @Clean() @IsString() @MaxLength(60) time?: string;
}
export class ProgressPhotoDto {
  @Clean() @IsString() @MinLength(2) @MaxLength(160) title: string;
  @IsOptional() @Clean() @IsString() @MaxLength(60) date?: string;
  @IsString() @MinLength(1) @MaxLength(1000) image: string;
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
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => UnitTypeDto) unitTypes?: UnitTypeDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => FloorPlanDto) floorPlans?: FloorPlanDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PaymentStepDto) paymentSchedule?: PaymentStepDto[];
  @IsOptional() @Clean() @IsString() @MaxLength(600) paymentNote?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => TowerDto) towers?: TowerDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => ProjectPhotoDto) photos?: ProjectPhotoDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => SalesPolicyDto) salesPolicies?: SalesPolicyDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ConnectionDto) connections?: ConnectionDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => ProgressPhotoDto) progressPhotos?: ProgressPhotoDto[];
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) videoUrl?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(300) scale?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(400) priceNote?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(80) handoverNote?: string | null;
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
  /** Admin list order: default, created, updated or name. */
  @IsOptional() @IsIn(ADMIN_SORTS) sort?: AdminSort;
}

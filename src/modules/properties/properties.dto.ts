import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Clean, CleanList } from '../../common/dto/fields.js';
import { PaginationQuery } from '../../common/dto/pagination.dto.js';
import { SLUG_PATTERN } from '../../common/utils/text.js';
import { Availability, Furnishing, PublishStatus } from '../../generated/prisma/enums.js';

const VND = /^\d{1,15}$/;
const VIDEO_PATTERN =
  /^(?!.*\.\.)(https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\/\S+|https:\/\/\S+\.(mp4|webm)(\?\S*)?|\/images\/[\w./-]+\.(mp4|webm))$/i;
const VND_MESSAGE = 'Số tiền phải là số nguyên VND không âm.';

export class CreatePropertyDto {
  @IsString() @Matches(SLUG_PATTERN, { message: 'Đường dẫn không hợp lệ.' }) @MaxLength(160) slug: string;
  @Clean() @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsUUID() projectId: string;
  @IsString() propertyType: string; // code
  @IsOptional() @Clean() @IsString() @MaxLength(40) unitCode?: string | null;
  @IsOptional() @IsBoolean() forRent?: boolean;
  @IsOptional() @IsBoolean() forSale?: boolean;
  @IsOptional() @IsBoolean() isConsignment?: boolean;
  @IsOptional() @IsEnum(Availability) availability?: Availability;
  @IsOptional() @IsEnum(PublishStatus) status?: PublishStatus;
  @IsOptional() @IsBoolean() isDemo?: boolean;
  @Clean() @IsString() @MinLength(2) @MaxLength(160) location: string;
  @IsOptional() @Clean() @IsString() @MaxLength(300) address?: string | null;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100000) areaM2: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(50) bedrooms: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(50) bathrooms: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-10) @Max(200) floor?: number | null;
  @IsOptional() @Clean() @IsString() @MaxLength(40) direction?: string | null;
  @IsOptional() @IsEnum(Furnishing) furnishing?: Furnishing;
  @IsOptional() @Matches(VND, { message: VND_MESSAGE }) rentPriceVnd?: string | null;
  @IsOptional() @Matches(VND, { message: VND_MESSAGE }) salePriceVnd?: string | null;
  @IsOptional() @Matches(VND, { message: VND_MESSAGE }) depositVnd?: string | null;
  @IsOptional() @Matches(VND, { message: VND_MESSAGE }) managementFeeVnd?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(120) minimumLeaseMonths?: number | null;
  @IsOptional() @IsISO8601({ strict: true }) availableFrom?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(120) contactName?: string | null;
  @IsOptional() @Matches(/^\+?[\d\s().-]{8,20}$/, { message: 'Số điện thoại không hợp lệ.' }) contactPhone?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(4000) rentalPolicy?: string | null;
  @Clean() @IsString() @MinLength(10) @MaxLength(10000) description: string;
  @IsOptional() @IsUUID() coverImageId?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(300) coverImageAlt?: string | null;
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(60) @IsUUID('all', { each: true }) galleryImageIds?: string[];
  @IsOptional() @CleanList() @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) @MaxLength(160, { each: true }) amenities?: string[];
  /** YouTube link, HTTPS MP4/WebM file, or a local file under /images. */
  @IsOptional()
  @Matches(VIDEO_PATTERN, { message: 'Video cần là liên kết YouTube, MP4/WebM HTTPS hoặc /images/ten-video.mp4.' })
  @MaxLength(500)
  videoUrl?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(120) seoTitle?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(320) seoDescription?: string | null;
}
export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
}

export class PublicPropertyQuery extends PaginationQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  @IsOptional() @IsString() project?: string; // project slug
  @IsOptional() @IsString() type?: string; // property type code
  @IsOptional() @Matches(VND) maxRentVnd?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bedrooms?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minArea?: number;
  @IsOptional() @IsEnum(Furnishing) furnishing?: Furnishing;
  @IsOptional() @IsEnum(Availability) availability?: Availability;
  @IsOptional() @IsIn(['rent', 'sale']) listing?: 'rent' | 'sale';
  @IsOptional() @IsIn(['price-asc', 'price-desc', 'area', 'newest', 'default']) sort?: string;
}
export class AdminPropertyQuery extends PublicPropertyQuery {
  @IsOptional() @IsEnum(PublishStatus) status?: PublishStatus;
}

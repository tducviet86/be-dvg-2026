import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Clean, CleanList } from '../../common/dto/fields.js';
import { PaginationQuery } from '../../common/dto/pagination.dto.js';
import { SLUG_PATTERN } from '../../common/utils/text.js';
import { PublishStatus } from '../../generated/prisma/enums.js';

export class CreatePostDto {
  @IsString() @Matches(SLUG_PATTERN, { message: 'Đường dẫn không hợp lệ.' }) @MaxLength(160) slug: string;
  @Clean() @IsString() @MinLength(2) @MaxLength(200) title: string;
  @Clean() @IsString() @MinLength(10) @MaxLength(600) excerpt: string;
  /** Plain text; paragraphs separated by blank lines. HTML is stripped. */
  @IsOptional() @Clean() @IsString() @MaxLength(50000) content?: string | null;
  @IsString() category: string; // category slug
  @IsOptional() @CleanList() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true }) tags?: string[];
  @IsOptional() @Clean() @IsString() @MaxLength(120) authorName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(120) readingMinutes?: number;
  @IsOptional() @IsEnum(PublishStatus) status?: PublishStatus;
  /** Future date with status PUBLISHED schedules the post. */
  @IsOptional() @IsISO8601() publishedAt?: string | null;
  @IsOptional() @IsBoolean() isDemo?: boolean;
  @IsOptional() @IsUUID() coverImageId?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(300) coverImageAlt?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(120) seoTitle?: string | null;
  @IsOptional() @Clean() @IsString() @MaxLength(320) seoDescription?: string | null;
}
export class UpdatePostDto extends PartialType(CreatePostDto) {
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
}
export class PublicPostQuery extends PaginationQuery {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() tag?: string;
}
export class AdminPostQuery extends PublicPostQuery {
  @IsOptional() @IsEnum(PublishStatus) status?: PublishStatus;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
export class CategoryDto {
  @IsString() @Matches(SLUG_PATTERN) @MaxLength(80) slug: string;
  @Clean() @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @Clean() @IsString() @MaxLength(300) description?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/auth.decorators.js';
import { PaginationQuery, pageMeta } from '../../common/dto/pagination.dto.js';
import { plainText } from '../../common/utils/text.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { MediaService, type MediaOwner } from './media.service.js';

class MediaQuery extends PaginationQuery {
  @IsOptional() @IsIn(['image', 'video']) type?: 'image' | 'video';
  /** Only files used somewhere, or only files nothing uses. */
  @IsOptional() @IsIn(['used', 'unused']) usage?: 'used' | 'unused';
  /** Searches the file path and the alt text. */
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['newest', 'oldest', 'largest']) sort?: 'newest' | 'oldest' | 'largest';
}
class DeleteManyDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('all', { each: true }) ids: string[];
}
class AltDto {
  @IsOptional() @IsString() @MaxLength(300) alt?: string;
  /** What the file belongs to: names the storage folder (can-ho/MB029/…). */
  @IsOptional() @IsIn(['property', 'project', 'post', 'banner']) owner?: MediaOwner;
  /** Unit code or slug of that record, e.g. "MB029". */
  @IsOptional() @IsString() @MaxLength(80) code?: string;
}

@ApiTags('admin/media')
@Controller('admin/media')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @RequirePermissions(PERMISSIONS.mediaWrite)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: AltDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.media.upload(file, body.alt, user.id, { owner: body.owner, code: body.code }) };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.contentRead)
  async list(@Query() q: MediaQuery) {
    const { data, total } = await this.media.list(q);
    return { data, meta: pageMeta(q.page, q.pageSize, total) };
  }

  @Get('stats')
  @RequirePermissions(PERMISSIONS.contentRead)
  async stats() {
    return { data: await this.media.stats() };
  }

  /** Usage counts, and the records using the file by name. */
  @Get(':id/usage')
  @RequirePermissions(PERMISSIONS.contentRead)
  async usage(@Param('id', ParseUUIDPipe) id: string) {
    const [counts, places] = await Promise.all([this.media.usage(id), this.media.places(id)]);
    return { data: { ...counts, places } };
  }

  /** Deletes several files at once; files still in use are kept. */
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.mediaWrite)
  async removeMany(@Body() body: DeleteManyDto, @CurrentUser() user: AuthUser) {
    return { data: await this.media.removeMany(body.ids, user.id) };
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.mediaWrite)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: AltDto) {
    return {
      data: await this.prisma.mediaAsset.update({
        where: { id },
        data: { alt: body.alt ? plainText(body.alt) : null },
      }),
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.mediaWrite)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.media.remove(id, user.id);
  }
}

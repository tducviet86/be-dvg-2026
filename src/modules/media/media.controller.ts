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
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/auth.decorators.js';
import { PaginationQuery, pageMeta } from '../../common/dto/pagination.dto.js';
import { plainText } from '../../common/utils/text.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { MediaService } from './media.service.js';

class MediaQuery extends PaginationQuery {
  @IsOptional() @IsIn(['image', 'video']) type?: 'image' | 'video';
}
class AltDto {
  @IsOptional() @IsString() @MaxLength(300) alt?: string;
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
    return { data: await this.media.upload(file, body.alt, user.id) };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.contentRead)
  async list(@Query() q: MediaQuery) {
    const where = q.type ? { mimeType: { startsWith: `${q.type}/` } } : {};
    const [rows, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return { data: rows, meta: pageMeta(q.page, q.pageSize, total) };
  }

  @Get(':id/usage')
  @RequirePermissions(PERMISSIONS.contentRead)
  async usage(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.media.usage(id) };
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

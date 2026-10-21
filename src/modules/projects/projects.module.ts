import { Module } from '@nestjs/common';
import { BannersModule } from '../banners/banners.module.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({ imports: [BannersModule], controllers: [ProjectsController], providers: [ProjectsService] })
export class ProjectsModule {}

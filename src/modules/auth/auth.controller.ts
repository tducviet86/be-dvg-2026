import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AppConfig } from '../../config/config.service.js';
import {
  CurrentUser,
  Public,
} from '../../common/decorators/auth.decorators.js';
import { AppError } from '../../common/errors.js';
import { csrfValid } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth.types.js';
import {
  clearAuthCookies,
  REFRESH_COOKIE,
  setAuthCookies,
} from './cookies.js';

class LoginDto {
  @IsEmail() @MaxLength(160) email: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}
const context = (req: Request) => ({
  ip: req.ip,
  userAgent: req.header('user-agent'),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password, context(req));
    setAuthCookies(res, this.config, result);
    return { data: { user: result.user, csrfToken: result.csrf } };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!csrfValid(req))
      throw new AppError(HttpStatus.FORBIDDEN, 'CSRF_INVALID', 'CSRF không hợp lệ.');
    try {
      const result = await this.auth.refresh(
        req.cookies?.[REFRESH_COOKIE],
        context(req),
      );
      setAuthCookies(res, this.config, result);
      return { data: { user: result.user, csrfToken: result.csrf } };
    } catch (error) {
      clearAuthCookies(res, this.config);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!csrfValid(req))
      throw new AppError(HttpStatus.FORBIDDEN, 'CSRF_INVALID', 'CSRF không hợp lệ.');
    await this.auth.logout(undefined, req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res, this.config);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { data: user };
  }
}

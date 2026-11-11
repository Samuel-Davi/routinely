import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  authUserSchema,
  loginSchema,
  registerSchema,
  type AuthUser,
  type LoginInput,
  type RegisterInput,
} from '@routinely/shared';
import type { Request, Response } from 'express';
import { AppError } from '../common/app-error';
import { CurrentUser } from '../common/current-user';
import { ApiZodBody, ApiZodResponse } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './cookies';
import { Public } from './public.decorator';
import { RateLimiter } from './rate-limiter';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly perIp: RateLimiter;
  private readonly perEmail: RateLimiter;

  constructor(
    private readonly service: AuthService,
    private readonly currentUser: CurrentUser,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.perIp = new RateLimiter(config.AUTH_RATE_LIMIT_MAX * 2, config.AUTH_RATE_LIMIT_TTL_MS);
    this.perEmail = new RateLimiter(config.AUTH_RATE_LIMIT_MAX, config.AUTH_RATE_LIMIT_TTL_MS);
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Cria a conta e abre a sessão (cookies httpOnly)' })
  @ApiZodBody(registerSchema)
  @ApiZodResponse(authUserSchema, 201)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    this.limit(req, body.email);
    const { user, tokens } = await this.service.register(body);
    setAuthCookies(res, tokens, this.config);
    return user;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Abre a sessão com e-mail e senha' })
  @ApiZodBody(loginSchema)
  @ApiZodResponse(authUserSchema)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    this.limit(req, body.email);
    const { user, tokens } = await this.service.login(body);
    setAuthCookies(res, tokens, this.config);
    this.perEmail.reset(`email:${body.email}`);
    return user;
  }

  /** Public on purpose: it is called when the access cookie has already expired. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Troca o refresh token por um novo par (rotação com detecção de reuso)',
  })
  @ApiZodResponse(authUserSchema)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthUser> {
    try {
      const { user, tokens } = await this.service.refresh(this.cookie(req, REFRESH_COOKIE));
      setAuthCookies(res, tokens, this.config);
      return user;
    } catch (error) {
      clearAuthCookies(res, this.config);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encerra a sessão (revoga o refresh token) e limpa os cookies' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.service.logout(this.cookie(req, REFRESH_COOKIE));
    clearAuthCookies(res, this.config);
  }

  @Get('me')
  @ApiOperation({ summary: 'Usuário da sessão atual' })
  @ApiZodResponse(authUserSchema)
  me(): Promise<AuthUser> {
    return this.service.me(this.currentUser.id);
  }

  private cookie(req: Request, name: string): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[name];
  }

  /** Per-IP and per-e-mail limits, so one address cannot be hammered from many IPs either. */
  private limit(req: Request, email: string): void {
    if (!this.perIp.allow(`ip:${req.ip}`) || !this.perEmail.allow(`email:${email}`)) {
      throw AppError.tooManyRequests();
    }
  }
}

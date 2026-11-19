import { Controller, Get, HttpCode, HttpStatus, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  passkeyLoginSchema,
  twoFactorLoginSchema,
  twoFactorSetupConfirmSchema,
  twoFactorSetupStartSchema,
  twoFactorTokenSchema,
  type LoginResult,
} from '@base/shared';
import { AppError, logger } from '@base/server-kit';
import type { z } from 'zod';
import type { RequestContext } from '../core/request-context';
import {
  AllowUnverifiedEmail,
  CurrentPrincipal,
  Public,
  ReqCtx,
  ZodBody,
} from '../decorators/customize';
import { t } from '../i18n';
import { toMeDto } from '../users/user.mapper';
import { AuthService } from './auth.service';
import { appBaseUrl } from '../config/app-urls';
import { GoogleService, type GoogleCallbackQuery } from './google.service';
import type { Principal } from './principal';
import { SessionService, type SessionResult } from './session.service';

function appendCookie(res: Response, cookie: string | null) {
  if (cookie) res.append('Set-Cookie', cookie);
}

/** Lỗi đăng nhập Google: quay về trang login kèm key lỗi (frontend tự dịch) */
function loginErrorUrl(app: 'admin' | 'user', error: unknown) {
  const key = error instanceof AppError ? error.key : 'auth.googleFailed';
  if (!(error instanceof AppError)) logger.error('Google login lỗi', error);
  return `${appBaseUrl(app)}/login?oauthError=${encodeURIComponent(key)}`;
}

/** Đăng nhập / đăng ký / phiên: /api/v1/auth/* */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: SessionService,
    private readonly google: GoogleService,
  ) {}

  /** Gắn cookie refresh vào response và trả body phiên đăng nhập */
  private sessionBody(
    res: Response,
    { session, cookie }: SessionResult,
    backupCodes?: string[],
  ): LoginResult {
    appendCookie(res, cookie);
    return { status: 'success', ...session, ...(backupCodes ? { backupCodes } : {}) };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @ZodBody(loginSchema) input: z.infer<typeof loginSchema>,
    @ReqCtx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    const outcome = await this.authService.login(input, ctx);
    return outcome.status === 'success' ? this.sessionBody(res, outcome.result) : outcome;
  }

  // ----- Bước 2FA khi đăng nhập (dùng tempToken trả về từ /auth/login hoặc Google) -----

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('2fa/methods')
  twoFactorMethods(
    @ZodBody(twoFactorTokenSchema) { tempToken }: z.infer<typeof twoFactorTokenSchema>,
    @ReqCtx() ctx: RequestContext,
  ) {
    return this.authService.twoFactorMethods(tempToken, ctx);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('2fa/email/send')
  sendTwoFactorEmail(
    @ZodBody(twoFactorTokenSchema) { tempToken }: z.infer<typeof twoFactorTokenSchema>,
    @ReqCtx() ctx: RequestContext,
  ) {
    return this.authService.sendLoginEmailCode(tempToken, ctx);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('2fa/verify')
  async verifyTwoFactor(
    @ZodBody(twoFactorLoginSchema) input: z.infer<typeof twoFactorLoginSchema>,
    @ReqCtx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sessionBody(res, await this.authService.verifyTwoFactor(input, ctx));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('2fa/passkey/options')
  passkeyLoginOptions(
    @ZodBody(twoFactorTokenSchema) { tempToken }: z.infer<typeof twoFactorTokenSchema>,
    @ReqCtx() ctx: RequestContext,
  ) {
    return this.authService.passkeyLoginOptions(tempToken, ctx);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('2fa/passkey/verify')
  async verifyPasskeyLogin(
    @ZodBody(passkeyLoginSchema) input: z.infer<typeof passkeyLoginSchema>,
    @ReqCtx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sessionBody(res, await this.authService.verifyPasskeyLogin(input, ctx));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('2fa/setup/methods')
  twoFactorSetupMethods(
    @ZodBody(twoFactorTokenSchema) { tempToken }: z.infer<typeof twoFactorTokenSchema>,
    @ReqCtx() ctx: RequestContext,
  ) {
    return this.authService.twoFactorSetupMethods(tempToken, ctx);
  }

  /** Thiết lập 2FA bắt buộc (tài khoản admin): bắt đầu với phương thức đã chọn */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('2fa/setup')
  setupTwoFactor(
    @ZodBody(twoFactorSetupStartSchema)
    { tempToken, method }: z.infer<typeof twoFactorSetupStartSchema>,
    @ReqCtx() ctx: RequestContext,
  ) {
    return this.authService.setupTwoFactorDuringLogin(tempToken, method, ctx);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('2fa/setup/confirm')
  async confirmTwoFactorSetup(
    @ZodBody(twoFactorSetupConfirmSchema) input: z.infer<typeof twoFactorSetupConfirmSchema>,
    @ReqCtx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { result, backupCodes } = await this.authService.confirmTwoFactorSetup(input, ctx);
    return this.sessionBody(res, result, backupCodes);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('register')
  async register(
    @ZodBody(registerSchema) input: z.infer<typeof registerSchema>,
    @ReqCtx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sessionBody(res, await this.authService.register(input, ctx));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@ReqCtx() { req, app }: RequestContext, @Res({ passthrough: true }) res: Response) {
    try {
      const { session, cookie } = await this.sessions.refresh(req, app);
      appendCookie(res, cookie);
      return session;
    } catch (error) {
      // Refresh thất bại: xoá cookie để trình duyệt không gửi lại token hỏng
      appendCookie(res, this.sessions.clearRefreshCookie(app));
      throw error;
    }
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@ReqCtx() { req, app }: RequestContext, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revokeCurrent(req, app);
    appendCookie(res, this.sessions.clearRefreshCookie(app));
    return { success: true };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(
    @ZodBody(forgotPasswordSchema) { email }: z.infer<typeof forgotPasswordSchema>,
    @ReqCtx() ctx: RequestContext,
  ) {
    await this.authService.forgotPassword(email, ctx);
    return { message: t(ctx.locale, 'auth.forgotPasswordSent') };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(
    @ZodBody(resetPasswordSchema) input: z.infer<typeof resetPasswordSchema>,
    @ReqCtx() ctx: RequestContext,
  ) {
    await this.authService.resetPassword(input);
    return { message: t(ctx.locale, 'auth.passwordResetSuccess') };
  }

  @AllowUnverifiedEmail()
  @Get('me')
  me(@CurrentPrincipal() principal: Principal) {
    return toMeDto(principal);
  }

  /** GET /auth/google?app=user&returnTo=/profile&lang=vi → chuyển sang trang đăng nhập Google */
  @Public()
  @Get('google')
  async googleStart(@Query() query: Record<string, string | undefined>, @Res() res: Response) {
    const app = query.app === 'admin' ? 'admin' : 'user';
    try {
      const { url, cookie } = await this.google.buildAuthorizeUrl(app, {
        returnTo: typeof query.returnTo === 'string' ? query.returnTo : undefined,
        lang: typeof query.lang === 'string' ? query.lang : undefined,
      });
      appendCookie(res, cookie);
      res.redirect(302, url);
    } catch (error) {
      res.redirect(302, loginErrorUrl(app, error));
    }
  }

  /** Google gọi lại sau khi người dùng đồng ý; tạo phiên rồi chuyển về app */
  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query() query: GoogleCallbackQuery,
    @ReqCtx() { req }: RequestContext,
    @Res() res: Response,
  ) {
    const app = this.google.peekApp(typeof query.state === 'string' ? query.state : undefined);
    const base = appBaseUrl(app);
    let location: string;
    try {
      const outcome = await this.google.handleCallback(query, req);
      if (outcome.type === 'twoFactor') {
        const param = outcome.setup ? 'twoFactorSetupToken' : 'twoFactorToken';
        location = `${base}/login?${param}=${encodeURIComponent(outcome.tempToken)}`;
      } else {
        appendCookie(res, outcome.result.cookie);
        location = `${base}${outcome.returnTo}`;
      }
    } catch (error) {
      location = loginErrorUrl(app, error);
    }
    appendCookie(res, this.google.clearStateCookie());
    res.redirect(302, location);
  }
}

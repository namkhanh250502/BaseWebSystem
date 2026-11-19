import { Injectable } from '@nestjs/common';
import { eq, roles, users, type User } from '@base/db';
import { isLocale, type AppName, type Locale } from '@base/shared';
import {
  AppError,
  badRequest,
  forbidden,
  logger,
  randomToken,
  readCookie,
  serializeCookie,
  signJwt,
  verifyJwt,
  type RequestLike,
} from '@base/server-kit';
import { GOOGLE_OAUTH_PATH, googleRedirectUri } from '../config/app-urls';
import { getEnv } from '../config/env';
import { InjectDb, type Database } from '../core/database';
import { MINUTE, RateLimitService } from '../core/rate-limit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { canAccessAdmin, PrincipalService } from './principal';
import { SessionService, type SessionResult } from './session.service';
import { TwoFactorService } from './two-factor/two-factor.service';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const STATE_AUDIENCE = 'google-oauth-state';
const STATE_COOKIE = 'g_oauth_state';
const COOKIE_PATH = GOOGLE_OAUTH_PATH;

interface GoogleProfile {
  sub: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
}

export interface GoogleCallbackQuery {
  state?: string;
  code?: string;
  error?: string;
}

export type GoogleCallbackOutcome =
  | { type: 'session'; result: SessionResult; returnTo: string }
  | { type: 'twoFactor'; tempToken: string; setup: boolean };

/** Đường dẫn nội bộ an toàn để quay về sau khi đăng nhập (chặn open redirect) */
function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : '/';
}

/**
 * Đăng nhập Google (OAuth phía server). Liên kết theo Google ID, sau đó theo email (email Google
 * đã xác minh); chưa có thì tạo tài khoản mới nếu hệ thống cho phép đăng ký.
 */
@Injectable()
export class GoogleService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly settings: SettingsService,
    private readonly rateLimit: RateLimitService,
    private readonly principals: PrincipalService,
    private readonly sessions: SessionService,
    private readonly twoFactor: TwoFactorService,
    private readonly notifications: NotificationsService,
  ) {}

  private async getCredentials() {
    const clientId = await this.settings.getString('google_client_id');
    const clientSecret = await this.settings.getString('google_client_secret');
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }

  /** Tạo URL chuyển sang Google; trả kèm cookie chứa nonce để chống CSRF ở callback */
  async buildAuthorizeUrl(app: AppName, options: { returnTo?: string; lang?: string }) {
    const credentials = await this.getCredentials();
    if (!credentials) throw badRequest('auth.googleDisabled');

    const nonce = randomToken(16);
    const state = await signJwt({
      subject: nonce,
      audience: STATE_AUDIENCE,
      secret: getEnv().JWT_SECRET,
      expiresIn: '10m',
      claims: {
        app,
        returnTo: safeReturnPath(options.returnTo),
        lang: isLocale(options.lang) ? options.lang : undefined,
      },
    });
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: googleRedirectUri(app),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    }).toString();

    const cookie = serializeCookie(STATE_COOKIE, nonce, {
      maxAgeSeconds: 600,
      path: COOKIE_PATH,
      secure: getEnv().cookieSecure,
    });
    return { url: url.toString(), cookie };
  }

  clearStateCookie() {
    return serializeCookie(STATE_COOKIE, '', {
      maxAgeSeconds: 0,
      path: COOKIE_PATH,
      secure: getEnv().cookieSecure,
    });
  }

  /** Đọc app từ state (kể cả khi state hết hạn) để biết chuyển lỗi về app nào */
  peekApp(state: string | undefined): AppName {
    try {
      const payload = JSON.parse(Buffer.from(state?.split('.')[1] ?? '', 'base64url').toString());
      return payload.app === 'admin' ? 'admin' : 'user';
    } catch {
      return 'user';
    }
  }

  async handleCallback(
    query: GoogleCallbackQuery,
    req: RequestLike,
  ): Promise<GoogleCallbackOutcome> {
    const { state, code } = query;
    if (query.error) throw badRequest('auth.googleCancelled');
    if (!state || !code) throw badRequest('auth.googleFailed');

    const verified = await verifyJwt(state, getEnv().JWT_SECRET, STATE_AUDIENCE);
    if (!verified || verified.subject !== readCookie(req, STATE_COOKIE)) {
      throw badRequest('auth.googleStateInvalid');
    }
    const app: AppName = verified.claims.app === 'admin' ? 'admin' : 'user';
    const lang = isLocale(verified.claims.lang) ? verified.claims.lang : undefined;
    await this.rateLimit.hit(`google:${verified.subject}`, 3, 10 * MINUTE);

    const credentials = await this.getCredentials();
    if (!credentials) throw badRequest('auth.googleDisabled');
    const profile = await this.fetchProfile(code, app, credentials);
    if (!profile.email || !profile.email_verified) throw badRequest('auth.googleEmailUnverified');

    const user = await this.findOrCreateUser(profile, lang);
    const principal = await this.principals.load(user.id);
    if (!principal) throw badRequest('auth.googleFailed');
    if (!principal.user.isActive) throw forbidden('auth.accountLocked');
    if (app === 'admin' && !canAccessAdmin(principal)) throw forbidden('auth.adminAccessDenied');

    if (principal.user.twoFactorEnabled) {
      return {
        type: 'twoFactor',
        tempToken: await this.twoFactor.issueTempToken(user.id, app),
        setup: false,
      };
    }
    if (app === 'admin' && (await this.settings.getBoolean('require_2fa_admin'))) {
      return {
        type: 'twoFactor',
        tempToken: await this.twoFactor.issueTempToken(user.id, app, 'setup'),
        setup: true,
      };
    }
    return {
      type: 'session',
      result: await this.sessions.create(principal, app, req),
      returnTo: safeReturnPath(verified.claims.returnTo),
    };
  }

  private async fetchProfile(
    code: string,
    app: AppName,
    credentials: { clientId: string; clientSecret: string },
  ): Promise<GoogleProfile> {
    try {
      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        body: new URLSearchParams({
          code,
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          redirect_uri: googleRedirectUri(app),
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const token = (await tokenRes.json()) as { access_token?: string; error?: string };
      if (!tokenRes.ok || !token.access_token) {
        logger.warn('Google token exchange thất bại', {
          status: tokenRes.status,
          error: token.error,
        });
        throw badRequest('auth.googleFailed');
      }
      const profileRes = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!profileRes.ok) throw badRequest('auth.googleFailed');
      return (await profileRes.json()) as GoogleProfile;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Không gọi được Google', error);
      throw badRequest('auth.googleFailed');
    }
  }

  /**
   * Tìm user theo Google ID, sau đó theo email (liên kết tài khoản sẵn có);
   * chưa có thì tạo mới (nếu hệ thống cho phép đăng ký). Email từ Google coi như đã xác minh.
   */
  private async findOrCreateUser(profile: GoogleProfile, lang: Locale | undefined): Promise<User> {
    const email = profile.email!.toLowerCase();

    const [byGoogle] = await this.db.select().from(users).where(eq(users.googleId, profile.sub));
    if (byGoogle) return byGoogle;

    const [byEmail] = await this.db.select().from(users).where(eq(users.email, email));
    if (byEmail) {
      const [linked] = await this.db
        .update(users)
        .set({
          googleId: profile.sub,
          emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
          avatarUrl: byEmail.avatarUrl ?? profile.picture ?? null,
        })
        .where(eq(users.id, byEmail.id))
        .returning();
      return linked!;
    }

    if (!(await this.settings.getBoolean('allow_registration'))) {
      throw forbidden('auth.registrationDisabled');
    }
    const roleName = await this.settings.getString('default_role');
    const [role] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, roleName));
    const [created] = await this.db
      .insert(users)
      .values({
        email,
        firstName: (profile.given_name ?? profile.name ?? '').slice(0, 100),
        lastName: (profile.family_name ?? '').slice(0, 100),
        passwordHash: null,
        googleId: profile.sub,
        emailVerifiedAt: new Date(),
        avatarUrl: profile.picture?.slice(0, 500) ?? null,
        roleId: role?.id ?? null,
        lang: lang ?? 'vi',
      })
      .returning();
    await this.notifications.notifyUser(created!, 'welcome', {
      type: 'success',
      params: { appName: await this.settings.getString('site_name') },
    });
    return created!;
  }
}

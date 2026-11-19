import { Injectable } from '@nestjs/common';
import { and, eq, isNull, ne, refreshTokens, users, type RefreshToken } from '@base/db';
import type { AppName, AuthSession } from '@base/shared';
import {
  getClientIp,
  randomToken,
  readCookie,
  serializeCookie,
  sha256,
  signJwt,
  unauthorized,
  type RequestLike,
} from '@base/server-kit';
import { getEnv } from '../config/env';
import { InjectDb, type Database, type DbOrTx } from '../core/database';
import { LoginHistoryService } from '../login-history/login-history.service';
import { toMeDto } from '../users/user.mapper';
import {
  ACCESS_TOKEN_AUDIENCE,
  canAccessAdmin,
  PrincipalService,
  type Principal,
} from './principal';

/** Token đã xoay vòng vẫn được chấp nhận trong khoảng này (nhiều tab refresh cùng lúc) */
const ROTATION_GRACE_MS = 60 * 1000;
/** Cookie gửi kèm mọi request /api/v1 (cần cho đổi mật khẩu: giữ lại phiên hiện tại) */
const COOKIE_PATH = '/api/v1';

const cookieName = (app: AppName) => `rt_${app}`;

function refreshTtlMs() {
  return getEnv().REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export interface SessionResult {
  session: AuthSession;
  /** Header Set-Cookie cần gửi kèm response (null = giữ nguyên cookie) */
  cookie: string | null;
}

/** Phiên đăng nhập: access token (JWT ngắn hạn) + refresh token xoay vòng trong cookie httpOnly */
@Injectable()
export class SessionService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly principals: PrincipalService,
    private readonly loginHistory: LoginHistoryService,
  ) {}

  buildRefreshCookie(app: AppName, token: string): string {
    return serializeCookie(cookieName(app), token, {
      maxAgeSeconds: Math.floor(refreshTtlMs() / 1000),
      path: COOKIE_PATH,
      secure: getEnv().cookieSecure,
    });
  }

  clearRefreshCookie(app: AppName): string {
    return serializeCookie(cookieName(app), '', {
      maxAgeSeconds: 0,
      path: COOKIE_PATH,
      secure: getEnv().cookieSecure,
    });
  }

  readRefreshToken(req: RequestLike, app: AppName): string | null {
    return readCookie(req, cookieName(app));
  }

  async issueAccessToken(userId: string): Promise<string> {
    const env = getEnv();
    return signJwt({
      subject: userId,
      audience: ACCESS_TOKEN_AUDIENCE,
      secret: env.JWT_SECRET,
      expiresIn: env.ACCESS_TOKEN_TTL,
    });
  }

  private async insertRefreshToken(
    db: DbOrTx,
    userId: string,
    app: AppName,
    req: RequestLike,
    token: string,
  ) {
    await db.insert(refreshTokens).values({
      userId,
      tokenHash: sha256(token),
      app,
      expiresAt: new Date(Date.now() + refreshTtlMs()),
      ipAddress: getClientIp(req)?.slice(0, 45) ?? null,
      userAgent: req.headers.get('user-agent')?.slice(0, 1000) ?? null,
    });
  }

  /** Tạo phiên mới sau khi đăng nhập thành công (`twoFactorMethod`: cách đã qua 2FA, ghi vào lịch sử) */
  async create(
    principal: Principal,
    app: AppName,
    req: RequestLike,
    options: { twoFactorMethod?: string } = {},
  ): Promise<SessionResult> {
    const refreshToken = randomToken(32);
    await this.insertRefreshToken(this.db, principal.user.id, app, req, refreshToken);
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, principal.user.id));
    await this.loginHistory.record(principal.user.id, app, req, options.twoFactorMethod);

    return {
      session: {
        accessToken: await this.issueAccessToken(principal.user.id),
        user: toMeDto(principal),
      },
      cookie: this.buildRefreshCookie(app, refreshToken),
    };
  }

  /**
   * Đổi refresh token lấy access token mới, đồng thời xoay vòng refresh token.
   * Token vừa bị xoay vòng (bởi tab khác) vẫn được chấp nhận trong 60 giây nhưng không cấp cookie mới.
   */
  async refresh(req: RequestLike, app: AppName): Promise<SessionResult> {
    const token = this.readRefreshToken(req, app);
    if (!token) throw unauthorized('auth.sessionExpired');

    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, sha256(token)), eq(refreshTokens.app, app)))
      .limit(1);
    if (!row || row.expiresAt <= new Date()) throw unauthorized('auth.sessionExpired');

    const inGrace = (r: RefreshToken) =>
      r.revokedAt !== null &&
      r.replacedByHash !== null &&
      Date.now() - r.revokedAt.getTime() < ROTATION_GRACE_MS;
    if (row.revokedAt && !inGrace(row)) throw unauthorized('auth.sessionExpired');

    const principal = await this.principals.load(row.userId);
    if (!principal || !principal.user.isActive || (app === 'admin' && !canAccessAdmin(principal))) {
      await this.revokeAll(row.userId);
      throw unauthorized('auth.sessionExpired');
    }

    const accessToken = await this.issueAccessToken(principal.user.id);
    const session = { accessToken, user: toMeDto(principal) };
    if (row.revokedAt) return { session, cookie: null };

    // Xoay vòng: chỉ 1 request thắng nhờ điều kiện revokedAt IS NULL
    const nextToken = randomToken(32);
    const rotated = await this.db.transaction(async (tx) => {
      const claimed = await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(), replacedByHash: sha256(nextToken) })
        .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });
      if (!claimed.length) return false;
      await this.insertRefreshToken(tx, row.userId, app, req, nextToken);
      return true;
    });

    return { session, cookie: rotated ? this.buildRefreshCookie(app, nextToken) : null };
  }

  /** Đăng xuất phiên hiện tại (theo cookie) */
  async revokeCurrent(req: RequestLike, app: AppName): Promise<void> {
    const token = this.readRefreshToken(req, app);
    if (!token) return;
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, sha256(token)), isNull(refreshTokens.revokedAt)));
  }

  /** Thu hồi mọi phiên của user, có thể giữ lại phiên hiện tại */
  async revokeAll(userId: string, exceptToken?: string | null): Promise<void> {
    const conditions = [eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)];
    if (exceptToken) conditions.push(ne(refreshTokens.tokenHash, sha256(exceptToken)));
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(...conditions));
  }
}

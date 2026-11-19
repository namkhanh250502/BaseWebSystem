import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, passwordResetTokens, roles, users } from '@base/db';
import {
  fullName,
  normalizeLocale,
  type AppName,
  type LoginInput,
  type LoginResult,
  type RegisterInput,
  type ResetPasswordInput,
  type TwoFactorMethod,
  type TwoFactorSetupConfirmInput,
  type TwoFactorVerifyMethod,
  type WebAuthnResponseInput,
} from '@base/shared';
import {
  badRequest,
  conflict,
  forbidden,
  getClientIp,
  hashPassword,
  logger,
  randomToken,
  sha256,
  unauthorized,
  verifyPassword,
} from '@base/server-kit';
import { getEnv } from '../config/env';
import { InjectDb, type Database } from '../core/database';
import { MINUTE, RateLimitService } from '../core/rate-limit.service';
import type { RequestContext } from '../core/request-context';
import { EmailVerificationService } from '../email-verification/email-verification.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { CaptchaService } from './captcha.service';
import { canAccessAdmin, PrincipalService, type Principal } from './principal';
import { SessionService, type SessionResult } from './session.service';
import { TwoFactorService } from './two-factor/two-factor.service';

const RESET_TOKEN_TTL_MINUTES = 60;

// Hash giả để so sánh khi email không tồn tại, tránh lộ email qua thời gian phản hồi
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

export type LoginOutcome =
  { status: 'success'; result: SessionResult } | Exclude<LoginResult, { status: 'success' }>;

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly rateLimit: RateLimitService,
    private readonly settings: SettingsService,
    private readonly principals: PrincipalService,
    private readonly sessions: SessionService,
    private readonly twoFactor: TwoFactorService,
    private readonly captcha: CaptchaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  private async loadActivePrincipal(userId: string, app: AppName): Promise<Principal> {
    const principal = await this.principals.load(userId);
    if (!principal) throw unauthorized('auth.invalidCredentials');
    if (!principal.user.isActive) throw forbidden('auth.accountLocked');
    if (app === 'admin' && !canAccessAdmin(principal)) throw forbidden('auth.adminAccessDenied');
    return principal;
  }

  async login(
    { email, password }: LoginInput,
    { req, app }: RequestContext,
  ): Promise<LoginOutcome> {
    const normalizedEmail = email.toLowerCase();
    await this.rateLimit.hit(`login:${getClientIp(req)}:${normalizedEmail}`, 10, 15 * MINUTE);

    const [user] = await this.db.select().from(users).where(eq(users.email, normalizedEmail));
    const valid = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
    // Vẫn so sánh với DUMMY_HASH để giữ thời gian phản hồi đồng đều, nhưng tài khoản chưa có
    // mật khẩu (tạo qua Google) phải luôn bị từ chối — nếu không, plaintext của hash giả sẽ
    // thành mật khẩu hợp lệ của mọi tài khoản như vậy.
    if (!user?.passwordHash || !valid) throw unauthorized('auth.invalidCredentials');

    const principal = await this.loadActivePrincipal(user.id, app);

    if (user.twoFactorEnabled) {
      return {
        status: 'requires2fa',
        tempToken: await this.twoFactor.issueTempToken(user.id, app),
        ...(await this.twoFactor.challengeInfo(user)),
      };
    }
    if (app === 'admin' && (await this.settings.getBoolean('require_2fa_admin'))) {
      return {
        status: 'requiresSetup',
        tempToken: await this.twoFactor.issueTempToken(user.id, app, 'setup'),
        allowedMethods: await this.twoFactor.setupMethodsForLogin(principal),
      };
    }
    return { status: 'success', result: await this.sessions.create(principal, app, req) };
  }

  /** Nạp user đang ở bước nhập 2FA (token tạm hợp lệ, tài khoản còn hoạt động, đã bật 2FA) */
  private async pendingPrincipal(tempToken: string, app: AppName) {
    const userId = await this.twoFactor.verifyTempToken(tempToken, app, 'verify');
    const principal = await this.loadActivePrincipal(userId, app);
    if (!principal.user.twoFactorEnabled) throw badRequest('twoFactor.notEnabled');
    return principal;
  }

  /** Danh sách phương thức 2FA của user (dùng khi quay về từ đăng nhập Google) */
  async twoFactorMethods(tempToken: string, { app }: RequestContext) {
    const { user } = await this.pendingPrincipal(tempToken, app);
    return this.twoFactor.challengeInfo(user);
  }

  /** Gửi mã 2FA qua email ở bước đăng nhập */
  async sendLoginEmailCode(tempToken: string, { req, app }: RequestContext) {
    const { user } = await this.pendingPrincipal(tempToken, app);
    const { emailHint, cooldownSeconds } = await this.twoFactor.prepare(
      user,
      'email',
      'login',
      req,
    );
    return { emailHint: emailHint!, cooldownSeconds: cooldownSeconds! };
  }

  /** Options để trình duyệt ký bằng passkey ở bước đăng nhập */
  async passkeyLoginOptions(tempToken: string, { app }: RequestContext) {
    const { user } = await this.pendingPrincipal(tempToken, app);
    return (await this.twoFactor.prepare(user, 'passkey', 'login')).options!;
  }

  /** Nhập mã TOTP / email / mã dự phòng ở bước đăng nhập */
  async verifyTwoFactor(
    input: { tempToken: string; method?: Exclude<TwoFactorVerifyMethod, 'passkey'>; code: string },
    { req, app }: RequestContext,
  ): Promise<SessionResult> {
    const principal = await this.pendingPrincipal(input.tempToken, app);
    const method = await this.twoFactor.verify(
      principal.user,
      { method: input.method, code: input.code },
      'login',
    );
    return this.sessions.create(principal, app, req, { twoFactorMethod: method });
  }

  /** Xác minh bằng passkey ở bước đăng nhập */
  async verifyPasskeyLogin(
    input: { tempToken: string; response: WebAuthnResponseInput },
    { req, app }: RequestContext,
  ): Promise<SessionResult> {
    const principal = await this.pendingPrincipal(input.tempToken, app);
    await this.twoFactor.verify(
      principal.user,
      { method: 'passkey', response: input.response },
      'login',
    );
    return this.sessions.create(principal, app, req, { twoFactorMethod: 'passkey' });
  }

  /** Phương thức được chọn ở bước bắt buộc thiết lập 2FA (dùng khi quay về từ đăng nhập Google) */
  async twoFactorSetupMethods(tempToken: string, { app }: RequestContext) {
    const userId = await this.twoFactor.verifyTempToken(tempToken, app, 'setup');
    const principal = await this.loadActivePrincipal(userId, app);
    if (principal.user.twoFactorEnabled) throw badRequest('twoFactor.alreadyEnabled');
    return { allowedMethods: await this.twoFactor.setupMethodsForLogin(principal) };
  }

  /** Bước thiết lập 2FA bắt buộc trong lúc đăng nhập (tài khoản admin): bắt đầu với 1 phương thức */
  async setupTwoFactorDuringLogin(
    tempToken: string,
    method: TwoFactorMethod,
    { req, app }: RequestContext,
  ) {
    const userId = await this.twoFactor.verifyTempToken(tempToken, app, 'setup');
    const principal = await this.loadActivePrincipal(userId, app);
    return this.twoFactor.startLoginSetup(principal, method, req);
  }

  /** Hoàn tất thiết lập bắt buộc: bật phương thức, tạo phiên, trả mã dự phòng */
  async confirmTwoFactorSetup(
    input: TwoFactorSetupConfirmInput,
    { req, app }: RequestContext,
  ): Promise<{ result: SessionResult; backupCodes: string[] }> {
    const userId = await this.twoFactor.verifyTempToken(input.tempToken, app, 'setup');
    const principal = await this.loadActivePrincipal(userId, app);
    const backupCodes = await this.twoFactor.confirmLoginSetup(principal, {
      method: input.method,
      code: input.code,
      response: input.response as WebAuthnResponseInput | undefined,
      name: input.name,
    });
    const fresh = await this.loadActivePrincipal(userId, app);
    return {
      result: await this.sessions.create(fresh, app, req, { twoFactorMethod: input.method }),
      backupCodes,
    };
  }

  async register(
    input: RegisterInput,
    { req, app, locale }: RequestContext,
  ): Promise<SessionResult> {
    if (!(await this.settings.getBoolean('allow_registration'))) {
      throw forbidden('auth.registrationDisabled');
    }
    await this.rateLimit.hit(`register:${getClientIp(req)}`, 10, 60 * MINUTE);
    await this.captcha.verify(req, input.captchaToken);

    const email = input.email.toLowerCase();
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (existing) throw conflict('auth.emailExists');

    const roleName = await this.settings.getString('default_role');
    const [role] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, roleName));

    const [user] = await this.db
      .insert(users)
      .values({
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash: await hashPassword(input.password),
        roleId: role?.id ?? null,
        lang: locale,
      })
      .returning();

    await this.notifications.notifyUser(user!, 'welcome', {
      type: 'success',
      params: { appName: await this.settings.getString('site_name') },
    });
    // Bắt buộc xác minh email: gửi mã ngay khi đăng ký (lỗi gửi không làm hỏng việc đăng ký,
    // user có thể bấm "Gửi lại" ở màn hình xác minh)
    if (await this.settings.getBoolean('require_email_verification')) {
      await this.emailVerification.sendCode(user!).catch((error) => {
        logger.warn('Không gửi được mã xác minh email khi đăng ký', error);
      });
    }

    const principal = await this.loadActivePrincipal(user!.id, app);
    return this.sessions.create(principal, app, req);
  }

  /** Luôn trả về thành công để không lộ email nào đã đăng ký */
  async forgotPassword(email: string, { req, app }: RequestContext): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    await this.rateLimit.hit(`forgot:${getClientIp(req)}`, 5, 15 * MINUTE);
    await this.rateLimit.hit(`forgot:${normalizedEmail}`, 3, 60 * MINUTE);

    const [user] = await this.db.select().from(users).where(eq(users.email, normalizedEmail));
    if (!user || !user.isActive) return;

    const token = randomToken(32);
    await this.db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * MINUTE),
    });

    const env = getEnv();
    const baseUrl = app === 'admin' ? env.ADMIN_APP_URL : env.USER_APP_URL;
    const link = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
    const locale = normalizeLocale(user.lang);
    await this.mail.sendResetPassword({
      to: user.email,
      name: fullName(user, locale) || user.email,
      link,
      locale,
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
    });
  }

  async resetPassword({ token, password }: ResetPasswordInput): Promise<void> {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, sha256(token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      );
    if (!row) throw badRequest('auth.resetTokenInvalid');

    const [user] = await this.db.select().from(users).where(eq(users.id, row.userId));
    if (!user) throw badRequest('auth.resetTokenInvalid');

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(password) })
        .where(eq(users.id, user.id));
      // Vô hiệu hoá mọi link đặt lại mật khẩu khác của user
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
    });
    await this.sessions.revokeAll(user.id);
    await this.notifications.notifyUser(user, 'passwordChanged', { type: 'warning' });
  }
}

import { Injectable } from '@nestjs/common';
import { and, count, eq, isNull, twoFactorBackupCodes, users, type User } from '@base/db';
import {
  maskEmail,
  normalizeLocale,
  REAUTH_TOKEN_TTL_SECONDS,
  STRONG_TWO_FACTOR_METHODS,
  TWO_FACTOR_METHOD_PRIORITY,
  TWO_FACTOR_METHODS,
  type AppName,
  type PasskeyAddedDto,
  type ReauthTokenDto,
  type TwoFactorChallengeInfoDto,
  type TwoFactorEnabledDto,
  type TwoFactorMethod,
  type TwoFactorPrepareDto,
  type TwoFactorSetupDto,
  type TwoFactorStatusDto,
  type TwoFactorVerifyMethod,
  type WebAuthnResponseInput,
} from '@base/shared';
import {
  badRequest,
  conflict,
  forbidden,
  generateBackupCodes,
  normalizeBackupCode,
  notFound,
  sha256,
  signJwt,
  unauthorized,
  verifyJwt,
  type RequestLike,
} from '@base/server-kit';
import { getEnv } from '../../config/env';
import { InjectDb, type Database } from '../../core/database';
import { MINUTE, RateLimitService } from '../../core/rate-limit.service';
import { t } from '../../i18n';
import { NotificationsService } from '../../notifications/notifications.service';
import { SettingsService } from '../../settings/settings.service';
import { canAccessAdmin, type Principal } from '../principal';
import { AuthChallengeStore, type ChallengePurpose } from './auth-challenge.store';
import { EmailOtpMethod } from './email-otp.method';
import { PasskeyMethod, toPasskeyDto } from './passkey.method';
import { TotpMethod } from './totp.method';

const TEMP_TOKEN_AUDIENCE = '2fa-pending';
const TEMP_TOKEN_TTL = '10m';
const REAUTH_TOKEN_AUDIENCE = '2fa-reauth';
const BACKUP_CODE_COUNT = 8;

/** Token tạm sau khi qua mật khẩu: 'verify' = nhập 2FA, 'setup' = bắt buộc thiết lập 2FA */
export type TempTokenPurpose = 'verify' | 'setup';

export interface TwoFactorVerifyInput {
  method?: TwoFactorVerifyMethod;
  code?: string;
  response?: WebAuthnResponseInput;
}

const byPriority = (methods: Iterable<TwoFactorMethod>) => {
  const set = new Set(methods);
  return TWO_FACTOR_METHOD_PRIORITY.filter((m) => set.has(m));
};

/**
 * Điều phối xác thực 2 lớp: TOTP / Email / Passkey + mã dự phòng dùng chung.
 * `users.twoFactorEnabled` luôn = "có ít nhất 1 phương thức đang bật".
 */
@Injectable()
export class TwoFactorService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly totp: TotpMethod,
    private readonly email: EmailOtpMethod,
    private readonly passkey: PasskeyMethod,
    private readonly challenges: AuthChallengeStore,
    private readonly settings: SettingsService,
    private readonly rateLimit: RateLimitService,
    private readonly notifications: NotificationsService,
  ) {}

  // ----- Token tạm (đăng nhập) và token xác minh lại (step-up) -----

  async issueTempToken(
    userId: string,
    app: AppName,
    purpose: TempTokenPurpose = 'verify',
  ): Promise<string> {
    return signJwt({
      subject: userId,
      audience: TEMP_TOKEN_AUDIENCE,
      secret: getEnv().JWT_SECRET,
      expiresIn: TEMP_TOKEN_TTL,
      claims: { app, purpose },
    });
  }

  async verifyTempToken(token: string, app: AppName, purpose?: TempTokenPurpose): Promise<string> {
    const result = await verifyJwt(token, getEnv().JWT_SECRET, TEMP_TOKEN_AUDIENCE);
    if (!result || result.claims.app !== app) throw unauthorized('twoFactor.tokenInvalid');
    if (purpose && (result.claims.purpose ?? 'verify') !== purpose)
      throw unauthorized('twoFactor.tokenInvalid');
    return result.subject;
  }

  async issueReauthToken(userId: string, app: AppName): Promise<ReauthTokenDto> {
    const reauthToken = await signJwt({
      subject: userId,
      audience: REAUTH_TOKEN_AUDIENCE,
      secret: getEnv().JWT_SECRET,
      // Chuỗi '300s' = tương đối; số nguyên sẽ bị jose hiểu là thời điểm tuyệt đối
      expiresIn: `${REAUTH_TOKEN_TTL_SECONDS}s`,
      claims: { app },
    });
    return { reauthToken, expiresIn: REAUTH_TOKEN_TTL_SECONDS };
  }

  async verifyReauthToken(token: string, userId: string, app: AppName): Promise<boolean> {
    const result = await verifyJwt(token, getEnv().JWT_SECRET, REAUTH_TOKEN_AUDIENCE);
    return result !== null && result.subject === userId && result.claims.app === app;
  }

  // ----- Phương thức khả dụng / đang bật -----

  /** Phương thức hệ thống cho phép bật mới (setting two_factor_methods) */
  async availableMethods(): Promise<TwoFactorMethod[]> {
    const raw = await this.settings.getString('two_factor_methods');
    const allowed = raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is TwoFactorMethod => (TWO_FACTOR_METHODS as readonly string[]).includes(s));
    return allowed.length ? byPriority(allowed) : ['totp'];
  }

  private async ensureAvailable(method: TwoFactorMethod) {
    if (!(await this.availableMethods()).includes(method))
      throw badRequest('twoFactor.methodNotAllowed');
  }

  async enabledMethods(user: User): Promise<TwoFactorMethod[]> {
    const methods: TwoFactorMethod[] = [];
    if (user.twoFactorTotpEnabled) methods.push('totp');
    if (user.twoFactorEmailEnabled) methods.push('email');
    if ((await this.passkey.countFor(user.id)) > 0) methods.push('passkey');
    return byPriority(methods);
  }

  /** Tài khoản quản trị khi bật require_2fa_admin: phải giữ ít nhất 1 phương thức trong danh sách này */
  async requiredMethods(principal: Principal): Promise<TwoFactorMethod[] | null> {
    if (!canAccessAdmin(principal) || !(await this.settings.getBoolean('require_2fa_admin')))
      return null;
    return (await this.settings.getBoolean('admin_2fa_allow_email'))
      ? [...TWO_FACTOR_METHODS]
      : [...STRONG_TWO_FACTOR_METHODS];
  }

  /** Phương thức được chọn ở bước bắt buộc thiết lập 2FA khi đăng nhập */
  async setupMethodsForLogin(principal: Principal): Promise<TwoFactorMethod[]> {
    const available = await this.availableMethods();
    const required = (await this.requiredMethods(principal)) ?? available;
    const methods = available.filter(
      (m) => required.includes(m) && (m !== 'email' || this.email.canEnable(principal.user)),
    );
    return methods.length ? methods : ['totp'];
  }

  private resolveDefault(user: User, enabled: TwoFactorMethod[]): TwoFactorMethod | null {
    const preferred = user.twoFactorDefaultMethod as TwoFactorMethod | null;
    if (preferred && enabled.includes(preferred)) return preferred;
    return enabled[0] ?? null;
  }

  async challengeInfo(user: User): Promise<TwoFactorChallengeInfoDto> {
    const methods = await this.enabledMethods(user);
    return {
      methods,
      defaultMethod: this.resolveDefault(user, methods),
      ...(methods.includes('email') ? { emailHint: maskEmail(user.email) } : {}),
    };
  }

  async status(principal: Principal): Promise<TwoFactorStatusDto> {
    const { user } = principal;
    const enabled = await this.enabledMethods(user);
    return {
      enabled: user.twoFactorEnabled,
      defaultMethod: this.resolveDefault(user, enabled),
      availableMethods: await this.availableMethods(),
      totp: { enabled: user.twoFactorTotpEnabled },
      email: {
        enabled: user.twoFactorEmailEnabled,
        canEnable: this.email.canEnable(user),
        emailHint: maskEmail(user.email),
      },
      passkeys: (await this.passkey.list(user.id)).map(toPasskeyDto),
      backupCodesRemaining: user.twoFactorEnabled ? await this.remainingBackupCodes(user.id) : 0,
      requiredMethods: await this.requiredMethods(principal),
    };
  }

  // ----- Xác minh (đăng nhập + xác minh lại) -----

  /** Bước chuẩn bị: email → gửi mã; passkey → options cho trình duyệt; totp → không cần */
  async prepare(
    user: User,
    method: TwoFactorMethod,
    purpose: ChallengePurpose,
    req?: RequestLike,
  ): Promise<TwoFactorPrepareDto> {
    if (!(await this.enabledMethods(user)).includes(method))
      throw badRequest('twoFactor.methodNotEnabled');
    if (method === 'email') return this.email.send(user, purpose, req);
    if (method === 'passkey')
      return { options: await this.passkey.authenticationOptions(user, purpose) };
    return {};
  }

  /** Xác minh bằng 1 phương thức đang bật hoặc mã dự phòng; sai thì ném lỗi. Trả về cách đã dùng. */
  async verify(
    user: User,
    input: TwoFactorVerifyInput,
    purpose: ChallengePurpose,
  ): Promise<TwoFactorVerifyMethod> {
    const key = `2fa:${user.id}`;
    await this.rateLimit.hit(key, 10, 10 * MINUTE);
    const enabled = await this.enabledMethods(user);
    const code = input.code?.trim() ?? '';

    let method = input.method;
    if (!method) {
      if (input.response) method = 'passkey';
      else if (/^\d{6}$/.test(code))
        method = enabled.includes('totp') || !enabled.includes('email') ? 'totp' : 'email';
      else method = 'backup';
    }
    if (method !== 'backup' && !enabled.includes(method))
      throw badRequest('twoFactor.methodNotEnabled');

    let ok: boolean;
    switch (method) {
      case 'totp':
        ok = await this.totp.verify(user, code);
        break;
      case 'email':
        ok = await this.email.verify(user, code, purpose);
        break;
      case 'passkey':
        ok = input.response ? await this.passkey.verify(user, input.response, purpose) : false;
        break;
      case 'backup':
        ok =
          user.twoFactorEnabled && code.length > 0 && (await this.consumeBackupCode(user.id, code));
        break;
    }
    if (!ok)
      throw badRequest(method === 'passkey' ? 'twoFactor.passkeyInvalid' : 'twoFactor.codeInvalid');
    await this.rateLimit.reset(key);
    return method;
  }

  // ----- Mã dự phòng -----

  /** Dùng 1 mã dự phòng (mỗi mã chỉ dùng được 1 lần) */
  async consumeBackupCode(userId: string, code: string): Promise<boolean> {
    const used = await this.db
      .update(twoFactorBackupCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(twoFactorBackupCodes.userId, userId),
          eq(twoFactorBackupCodes.codeHash, sha256(normalizeBackupCode(code))),
          isNull(twoFactorBackupCodes.usedAt),
        ),
      )
      .returning({ id: twoFactorBackupCodes.id });
    return used.length > 0;
  }

  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const codes = generateBackupCodes(BACKUP_CODE_COUNT);
    await this.db.transaction(async (tx) => {
      await tx.delete(twoFactorBackupCodes).where(eq(twoFactorBackupCodes.userId, userId));
      await tx
        .insert(twoFactorBackupCodes)
        .values(codes.map((c) => ({ userId, codeHash: sha256(normalizeBackupCode(c)) })));
    });
    return codes;
  }

  async regenerateBackupCodesFor(user: User): Promise<string[]> {
    if (!user.twoFactorEnabled) throw badRequest('twoFactor.notEnabled');
    return this.regenerateBackupCodes(user.id);
  }

  async remainingBackupCodes(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(twoFactorBackupCodes)
      .where(and(eq(twoFactorBackupCodes.userId, userId), isNull(twoFactorBackupCodes.usedAt)));
    return row?.value ?? 0;
  }

  // ----- Thêm / xoá phương thức -----

  private methodLabel(user: User, method: TwoFactorMethod) {
    return t(normalizeLocale(user.lang), `twoFactorMethods.${method}`);
  }

  /** Sau khi bật 1 phương thức: cập nhật cờ + mặc định; lần đầu bật 2FA thì sinh mã dự phòng */
  private async afterMethodAdded(
    user: User,
    method: TwoFactorMethod,
  ): Promise<string[] | undefined> {
    const firstMethod = !user.twoFactorEnabled;
    const preferred = user.twoFactorDefaultMethod;
    await this.db
      .update(users)
      .set({
        twoFactorEnabled: true,
        ...(firstMethod || !preferred ? { twoFactorDefaultMethod: method } : {}),
      })
      .where(eq(users.id, user.id));
    if (firstMethod) {
      const codes = await this.regenerateBackupCodes(user.id);
      await this.notifications.notifyUser(user, 'twoFactorEnabled', { type: 'success' });
      return codes;
    }
    await this.notifications.notifyUser(user, 'twoFactorMethodAdded', {
      type: 'success',
      params: { method: this.methodLabel(user, method) },
    });
    return undefined;
  }

  /** Sau khi tắt 1 phương thức: hết phương thức thì tắt hẳn 2FA, ngược lại chỉnh lại mặc định */
  private async afterMethodRemoved(userId: string, method: TwoFactorMethod): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) return;
    const remaining = await this.enabledMethods(user);
    if (!remaining.length) {
      await this.clearAll(userId);
      await this.notifications.notifyUser(user, 'twoFactorDisabled', { type: 'warning' });
      return;
    }
    await this.db
      .update(users)
      .set({ twoFactorDefaultMethod: this.resolveDefault(user, remaining) })
      .where(eq(users.id, userId));
    await this.notifications.notifyUser(user, 'twoFactorMethodRemoved', {
      type: 'warning',
      params: { method: this.methodLabel(user, method) },
    });
  }

  /** Không cho tài khoản quản trị (bắt buộc 2FA) xoá phương thức hợp lệ cuối cùng */
  private async ensureCanRemove(principal: Principal, remaining: TwoFactorMethod[]) {
    const required = await this.requiredMethods(principal);
    if (!required) return;
    if (!remaining.some((m) => required.includes(m))) {
      throw forbidden(
        remaining.length ? 'twoFactor.lastStrongMethod' : 'twoFactor.requiredForAdmin',
      );
    }
  }

  private async remainingAfterRemoving(user: User, method: TwoFactorMethod) {
    return (await this.enabledMethods(user)).filter((m) => m !== method);
  }

  // TOTP
  async startTotpSetup(user: User): Promise<TwoFactorSetupDto> {
    if (user.twoFactorTotpEnabled) throw conflict('twoFactor.alreadyEnabled');
    await this.ensureAvailable('totp');
    return this.totp.startSetup(user);
  }

  async enableTotp(user: User, code: string): Promise<TwoFactorEnabledDto> {
    if (user.twoFactorTotpEnabled) throw conflict('twoFactor.alreadyEnabled');
    if (!user.twoFactorSecret) throw badRequest('twoFactor.notSetup');
    await this.ensureAvailable('totp');
    await this.rateLimit.hit(`2fa:${user.id}`, 10, 10 * MINUTE);
    if (!(await this.totp.verify(user, code))) throw badRequest('twoFactor.codeInvalid');
    await this.rateLimit.reset(`2fa:${user.id}`);
    await this.totp.enable(user.id);
    return { backupCodes: await this.afterMethodAdded(user, 'totp') };
  }

  async disableTotp(principal: Principal): Promise<void> {
    if (!principal.user.twoFactorTotpEnabled) throw badRequest('twoFactor.methodNotEnabled');
    await this.ensureCanRemove(
      principal,
      await this.remainingAfterRemoving(principal.user, 'totp'),
    );
    await this.totp.disable(principal.user.id);
    await this.afterMethodRemoved(principal.user.id, 'totp');
  }

  // Email
  async sendEmailEnableCode(user: User, req?: RequestLike) {
    if (user.twoFactorEmailEnabled) throw conflict('twoFactor.alreadyEnabled');
    if (!this.email.canEnable(user)) throw badRequest('twoFactor.emailNotVerified');
    await this.ensureAvailable('email');
    return this.email.send(user, 'enable', req);
  }

  async enableEmail(user: User, code: string): Promise<TwoFactorEnabledDto> {
    if (user.twoFactorEmailEnabled) throw conflict('twoFactor.alreadyEnabled');
    if (!this.email.canEnable(user)) throw badRequest('twoFactor.emailNotVerified');
    await this.ensureAvailable('email');
    await this.rateLimit.hit(`2fa:${user.id}`, 10, 10 * MINUTE);
    if (!(await this.email.verify(user, code, 'enable'))) throw badRequest('twoFactor.codeInvalid');
    await this.rateLimit.reset(`2fa:${user.id}`);
    await this.email.enable(user.id);
    return { backupCodes: await this.afterMethodAdded(user, 'email') };
  }

  async disableEmail(principal: Principal): Promise<void> {
    if (!principal.user.twoFactorEmailEnabled) throw badRequest('twoFactor.methodNotEnabled');
    await this.ensureCanRemove(
      principal,
      await this.remainingAfterRemoving(principal.user, 'email'),
    );
    await this.email.disable(principal.user.id);
    await this.afterMethodRemoved(principal.user.id, 'email');
  }

  // Passkey
  async passkeyRegistrationOptions(user: User) {
    await this.ensureAvailable('passkey');
    return this.passkey.registrationOptions(user, 'enable');
  }

  async addPasskey(
    user: User,
    name: string,
    response: WebAuthnResponseInput,
  ): Promise<PasskeyAddedDto> {
    await this.ensureAvailable('passkey');
    const row = await this.passkey.register(user, response, name, 'enable');
    return {
      passkey: toPasskeyDto(row),
      backupCodes: await this.afterMethodAdded(user, 'passkey'),
    };
  }

  async renamePasskey(userId: string, id: string, name: string) {
    const row = await this.passkey.rename(userId, id, name);
    if (!row) throw notFound('twoFactor.passkeyNotFound');
    return toPasskeyDto(row);
  }

  async removePasskey(principal: Principal, id: string): Promise<void> {
    const { user } = principal;
    if (!(await this.passkey.find(user.id, id))) throw notFound('twoFactor.passkeyNotFound');
    const isLast = (await this.passkey.countFor(user.id)) === 1;
    if (isLast)
      await this.ensureCanRemove(principal, await this.remainingAfterRemoving(user, 'passkey'));
    await this.passkey.remove(user.id, id);
    if (isLast) await this.afterMethodRemoved(user.id, 'passkey');
    else {
      await this.notifications.notifyUser(user, 'twoFactorMethodRemoved', {
        type: 'warning',
        params: { method: this.methodLabel(user, 'passkey') },
      });
    }
  }

  async setDefaultMethod(user: User, method: TwoFactorMethod): Promise<void> {
    if (!(await this.enabledMethods(user)).includes(method))
      throw badRequest('twoFactor.methodNotEnabled');
    await this.db
      .update(users)
      .set({ twoFactorDefaultMethod: method })
      .where(eq(users.id, user.id));
  }

  // ----- Thiết lập bắt buộc khi đăng nhập -----

  async startLoginSetup(principal: Principal, method: TwoFactorMethod, req?: RequestLike) {
    if (principal.user.twoFactorEnabled) throw badRequest('twoFactor.alreadyEnabled');
    if (!(await this.setupMethodsForLogin(principal)).includes(method)) {
      throw badRequest('twoFactor.methodNotAllowed');
    }
    if (method === 'totp')
      return { method, ...(await this.startTotpSetup(principal.user)) } as const;
    if (method === 'email')
      return { method, ...(await this.sendEmailEnableCode(principal.user, req)) } as const;
    return { method, options: await this.passkeyRegistrationOptions(principal.user) } as const;
  }

  async confirmLoginSetup(
    principal: Principal,
    input: {
      method: TwoFactorMethod;
      code?: string;
      response?: WebAuthnResponseInput;
      name?: string;
    },
  ): Promise<string[]> {
    const { user } = principal;
    if (user.twoFactorEnabled) throw badRequest('twoFactor.alreadyEnabled');
    if (!(await this.setupMethodsForLogin(principal)).includes(input.method)) {
      throw badRequest('twoFactor.methodNotAllowed');
    }
    let result: TwoFactorEnabledDto;
    if (input.method === 'passkey') {
      if (!input.response) throw badRequest('twoFactor.passkeyInvalid');
      result = await this.addPasskey(user, input.name ?? 'Passkey', input.response);
    } else {
      if (!input.code) throw badRequest('twoFactor.codeInvalid');
      result =
        input.method === 'totp'
          ? await this.enableTotp(user, input.code)
          : await this.enableEmail(user, input.code);
    }
    return result.backupCodes ?? [];
  }

  // ----- Tắt toàn bộ -----

  /** Người dùng tự tắt toàn bộ 2FA (đã xác minh lại ở controller) */
  async disableAllFor(principal: Principal): Promise<void> {
    if (!principal.user.twoFactorEnabled) throw badRequest('twoFactor.notEnabled');
    await this.ensureCanRemove(principal, []);
    await this.clearAll(principal.user.id);
    await this.notifications.notifyUser(principal.user, 'twoFactorDisabled', { type: 'warning' });
  }

  /** Xoá sạch: TOTP, email, passkey, mã dự phòng (dùng cả cho admin tắt giúp user) */
  async clearAll(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorTotpEnabled: false,
          twoFactorEmailEnabled: false,
          twoFactorDefaultMethod: null,
        })
        .where(eq(users.id, userId));
      await tx.delete(twoFactorBackupCodes).where(eq(twoFactorBackupCodes.userId, userId));
    });
    await this.passkey.removeAll(userId);
    await this.challenges.revokeAll(userId);
  }
}

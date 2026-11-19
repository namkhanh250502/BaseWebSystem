import { eq, loginHistories, notifications, passkeys, twoFactorBackupCodes } from '@base/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, fail, ok, type TestApp } from './helpers/app';
import { createUser, reloadUser, totpCode, wrongTotpCode } from './helpers/fixtures';
import {
  addPasskey,
  enableEmail,
  enableTotp,
  reauthWithTotp,
  signedInClient,
} from './helpers/flows';
import { SoftAuthenticator } from './helpers/webauthn';

/** Chính sách 2FA: bắt buộc cho admin, tắt toàn bộ, admin tắt giúp user, thông báo */
describe('2FA: chính sách & quản trị', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  describe('Tắt toàn bộ 2FA (POST /me/2fa/disable)', () => {
    it('cần xác minh lại + mật khẩu; xoá mọi phương thức, đăng xuất thiết bị khác', async () => {
      const { client, email, password, user } = await signedInClient(t);
      const { secret } = await enableTotp(client);
      await reauthWithTotp(client, secret);
      await enableEmail(t, client, email);
      await addPasskey(client);

      const other = new Client(t.server);
      ok(await other.login(email, password));
      ok(
        await other.post('/auth/2fa/verify', {
          tempToken: (await other.login(email, password)).body.data.tempToken,
          code: totpCode(secret),
        }),
      );

      client.reauthToken = null;
      fail(await client.post('/me/2fa/disable', { password }), 403, 'twoFactor.reauthRequired');
      await reauthWithTotp(client, secret);
      fail(
        await client.post('/me/2fa/disable', { password: 'Wrong1234' }),
        400,
        'account.passwordIncorrect',
      );
      fail(await client.post('/me/2fa/disable', {}), 400, 'account.passwordIncorrect');
      ok(await client.post('/me/2fa/disable', { password }), 204);

      const fresh = await reloadUser(t.db, user.id);
      expect(fresh).toMatchObject({
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorTotpEnabled: false,
        twoFactorEmailEnabled: false,
        twoFactorDefaultMethod: null,
      });
      expect(await t.db.select().from(passkeys).where(eq(passkeys.userId, user.id))).toHaveLength(
        0,
      );
      expect(
        await t.db
          .select()
          .from(twoFactorBackupCodes)
          .where(eq(twoFactorBackupCodes.userId, user.id)),
      ).toHaveLength(0);

      // Phiên hiện tại còn, phiên khác bị thu hồi
      ok(await client.post('/auth/refresh'));
      fail(await other.post('/auth/refresh'), 401, 'auth.sessionExpired');

      // Đăng nhập lại không còn hỏi 2FA
      expect(ok(await new Client(t.server).login(email, password)).status).toBe('success');
      fail(await client.post('/me/2fa/disable', { password }), 400, 'twoFactor.notEnabled');
    });
  });

  describe('Bắt buộc 2FA cho quản trị viên (require_2fa_admin)', () => {
    beforeAll(async () => {
      await t.setSetting('require_2fa_admin', 'true');
    });
    afterAll(async () => {
      await t.setSetting('require_2fa_admin', 'false');
    });
    afterEach(async () => {
      await t.setSetting('admin_2fa_allow_email', 'false');
    });

    it('admin chưa bật 2FA vào app admin → requiresSetup, mặc định không cho chọn email', async () => {
      const { email, password } = await createUser(t.db, { admin: true });
      const data = ok(await new Client(t.server, 'admin').login(email, password));
      expect(data.status).toBe('requiresSetup');
      expect(data.allowedMethods).toEqual(['passkey', 'totp']);
      expect(data).not.toHaveProperty('accessToken');

      // Đăng nhập app user thì không bị bắt buộc
      expect(ok(await new Client(t.server, 'user').login(email, password)).status).toBe('success');
    });

    it('thiết lập TOTP ngay trong lúc đăng nhập → nhận phiên + mã dự phòng', async () => {
      const { email, password, user } = await createUser(t.db, { admin: true });
      const admin = new Client(t.server, 'admin');
      const { tempToken } = ok(await admin.login(email, password));

      fail(
        await admin.post('/auth/2fa/setup', { tempToken, method: 'email' }),
        400,
        'twoFactor.methodNotAllowed',
      );
      expect(ok(await admin.post('/auth/2fa/setup/methods', { tempToken })).allowedMethods).toEqual(
        ['passkey', 'totp'],
      );

      const setup = ok(await admin.post('/auth/2fa/setup', { tempToken, method: 'totp' }));
      expect(setup.method).toBe('totp');
      fail(
        await admin.post('/auth/2fa/setup/confirm', {
          tempToken,
          method: 'totp',
          code: wrongTotpCode(setup.secret),
        }),
        400,
        'twoFactor.codeInvalid',
      );
      fail(
        await admin.post('/auth/2fa/setup/confirm', { tempToken, method: 'totp' }),
        400,
        'twoFactor.codeInvalid',
      );
      const done = await admin.post('/auth/2fa/setup/confirm', {
        tempToken,
        method: 'totp',
        code: totpCode(setup.secret),
      });
      const session = ok(done);
      expect(session.status).toBe('success');
      expect(session.backupCodes).toHaveLength(8);
      expect(String(done.headers['set-cookie'])).toMatch(/rt_admin=/);

      // Token thiết lập không dùng lại được khi đã bật
      fail(
        await admin.post('/auth/2fa/setup', { tempToken, method: 'totp' }),
        400,
        'twoFactor.alreadyEnabled',
      );
      const history = await t.db
        .select()
        .from(loginHistories)
        .where(eq(loginHistories.userId, user.id));
      expect(history.some((h) => h.app === 'admin' && h.twoFactorMethod === 'totp')).toBe(true);

      // Lần sau: requires2fa như bình thường
      expect(ok(await new Client(t.server, 'admin').login(email, password)).status).toBe(
        'requires2fa',
      );
    });

    it('thiết lập passkey trong lúc đăng nhập', async () => {
      const { email, password } = await createUser(t.db, { admin: true });
      const admin = new Client(t.server, 'admin');
      admin.userAgent =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15';
      const { tempToken } = ok(await admin.login(email, password));
      const setup = ok(await admin.post('/auth/2fa/setup', { tempToken, method: 'passkey' }));
      expect(setup.method).toBe('passkey');
      const auth = new SoftAuthenticator('http://localhost:5174');
      const session = ok(
        await admin.post('/auth/2fa/setup/confirm', {
          tempToken,
          method: 'passkey',
          name: 'Safari on macOS',
          response: auth.register(setup.options),
        }),
      );
      expect(session.backupCodes).toHaveLength(8);
    });

    it('token thiết lập và token xác minh không dùng lẫn cho nhau', async () => {
      const setupUser = await createUser(t.db, { admin: true });
      const setupToken = ok(
        await new Client(t.server, 'admin').login(setupUser.email, setupUser.password),
      ).tempToken;
      fail(
        await new Client(t.server, 'admin').post('/auth/2fa/verify', {
          tempToken: setupToken,
          code: '123456',
        }),
        401,
        'twoFactor.tokenInvalid',
      );
      fail(
        await new Client(t.server, 'admin').post('/auth/2fa/methods', { tempToken: setupToken }),
        401,
        'twoFactor.tokenInvalid',
      );

      const verifyUser = await signedInClient(t, { admin: true });
      await enableTotp(verifyUser.client);
      const verifyToken = ok(
        await new Client(t.server, 'admin').login(verifyUser.email, verifyUser.password),
      ).tempToken;
      fail(
        await new Client(t.server, 'admin').post('/auth/2fa/setup', {
          tempToken: verifyToken,
          method: 'totp',
        }),
        401,
        'twoFactor.tokenInvalid',
      );
      fail(
        await new Client(t.server, 'admin').post('/auth/2fa/setup/confirm', {
          tempToken: verifyToken,
          method: 'totp',
          code: '123456',
        }),
        401,
        'twoFactor.tokenInvalid',
      );
    });

    it('admin_2fa_allow_email = true: cho chọn email (khi email đã xác minh)', async () => {
      await t.setSetting('admin_2fa_allow_email', 'true');
      const verified = await createUser(t.db, { admin: true });
      expect(
        ok(await new Client(t.server, 'admin').login(verified.email, verified.password))
          .allowedMethods,
      ).toEqual(['passkey', 'totp', 'email']);
      const unverified = await createUser(t.db, { admin: true, verified: false });
      expect(
        ok(await new Client(t.server, 'admin').login(unverified.email, unverified.password))
          .allowedMethods,
      ).toEqual(['passkey', 'totp']);

      const admin = new Client(t.server, 'admin');
      const { tempToken } = ok(await admin.login(verified.email, verified.password));
      ok(await admin.post('/auth/2fa/setup', { tempToken, method: 'email' }));
      const code = t.mail.last('twoFactorCode', verified.email)!.code;
      expect(
        ok(await admin.post('/auth/2fa/setup/confirm', { tempToken, method: 'email', code }))
          .status,
      ).toBe('success');
    });

    it('admin không gỡ được phương thức mạnh cuối cùng, không tắt được 2FA; gỡ email thì được', async () => {
      const { client, email, user } = await signedInClient(t, { admin: true });
      const { secret } = await enableTotp(client);
      await reauthWithTotp(client, secret);
      await enableEmail(t, client, email);

      const status = ok(await client.get('/me/2fa'));
      expect(status.requiredMethods).toEqual(['passkey', 'totp']);

      fail(await client.delete('/me/2fa/totp'), 403, 'twoFactor.lastStrongMethod');
      fail(
        await client.post('/me/2fa/disable', { password: 'Password123' }),
        403,
        'twoFactor.requiredForAdmin',
      );
      ok(await client.delete('/me/2fa/email'), 204);
      fail(await client.delete('/me/2fa/totp'), 403, 'twoFactor.requiredForAdmin');

      // Có passkey thì gỡ được TOTP
      await addPasskey(client);
      ok(await client.delete('/me/2fa/totp'), 204);
      expect((await reloadUser(t.db, user.id)).twoFactorEnabled).toBe(true);
    });
  });

  describe('Admin tắt 2FA giúp user (POST /users/:id/disable-2fa)', () => {
    it('xoá sạch TOTP, email, passkey, mã dự phòng; user thường không có quyền gọi', async () => {
      const target = await signedInClient(t);
      const { secret } = await enableTotp(target.client);
      await reauthWithTotp(target.client, secret);
      await enableEmail(t, target.client, target.email);
      await addPasskey(target.client);

      const outsider = await signedInClient(t);
      fail(await outsider.client.post(`/users/${target.user.id}/disable-2fa`), 403);

      const admin = await signedInClient(t, { superAdmin: true });
      const dto = ok(await admin.client.post(`/users/${target.user.id}/disable-2fa`));
      expect(dto.twoFactorEnabled).toBe(false);
      const fresh = await reloadUser(t.db, target.user.id);
      expect(fresh).toMatchObject({
        twoFactorTotpEnabled: false,
        twoFactorEmailEnabled: false,
        twoFactorSecret: null,
      });
      expect(
        await t.db.select().from(passkeys).where(eq(passkeys.userId, target.user.id)),
      ).toHaveLength(0);
      expect(ok(await new Client(t.server).login(target.email, target.password)).status).toBe(
        'success',
      );
    });
  });

  describe('Thông báo bảo mật', () => {
    it('bật lần đầu / thêm / gỡ phương thức đều tạo thông báo cho user', async () => {
      const { client, email, user } = await signedInClient(t, { lang: 'en' });
      const { secret } = await enableTotp(client);
      await reauthWithTotp(client, secret);
      await enableEmail(t, client, email);
      ok(await client.delete('/me/2fa/email'), 204);
      const titles = (
        await t.db.select().from(notifications).where(eq(notifications.userId, user.id))
      ).map((n) => n.title);
      expect(titles).toEqual(
        expect.arrayContaining([
          'Two-factor authentication enabled',
          'Two-factor method added',
          'Two-factor method removed',
        ]),
      );
      const messages = (
        await t.db.select().from(notifications).where(eq(notifications.userId, user.id))
      ).map((n) => n.message);
      expect(messages.some((m) => m.includes('"Email"'))).toBe(true);
    });
  });

  describe('Quay về từ đăng nhập Google (POST /auth/2fa/methods)', () => {
    it('trả danh sách phương thức theo token tạm', async () => {
      const { client, email, password } = await signedInClient(t);
      await enableEmail(t, client, email);
      const { tempToken } = ok(await new Client(t.server).login(email, password));
      const info = ok(await new Client(t.server).post('/auth/2fa/methods', { tempToken }));
      expect(info).toMatchObject({ methods: ['email'], defaultMethod: 'email' });
      expect(info.emailHint).toMatch(/\*\*\*/);
    });
  });
});

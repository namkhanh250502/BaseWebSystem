import { and, eq, loginHistories, notifications, twoFactorBackupCodes, users } from '@base/db';
import { signJwt } from '@base/server-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, fail, ok, type TestApp } from './helpers/app';
import { createUser, reloadUser, totpCode, wrongTotpCode } from './helpers/fixtures';
import { enableTotp, reauthWithTotp, signedInClient, startLogin } from './helpers/flows';
import { TEST_ENV } from './test-env';

/** 2FA bằng ứng dụng xác thực (TOTP), mã dự phòng, token tạm khi đăng nhập, xác minh lại */
describe('2FA: TOTP & mã dự phòng', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  describe('Chống dùng lại mã (RFC 6238 §5.2)', () => {
    beforeAll(() => {
      t.totp.replayProtection = true;
    });
    afterAll(() => {
      t.totp.replayProtection = false;
    });

    /** Bật TOTP bằng mã của bước hiện tại; trả kèm mã bước kế tiếp (lấy cùng lúc để không lệch bước) */
    async function enableWithCurrentCode(client: Client) {
      const setup = ok(await client.post('/me/2fa/totp/setup'));
      const secret = setup.secret as string;
      const current = totpCode(secret);
      const next = totpCode(secret, 1);
      ok(await client.post('/me/2fa/totp/enable', { code: current }));
      return { secret, current, next };
    }

    it('mã đã dùng (hoặc cũ hơn mã đã dùng) bị từ chối; mã bước mới vẫn dùng được', async () => {
      const { client, email, password, user } = await signedInClient(t);
      const { current, next } = await enableWithCurrentCode(client);
      expect((await reloadUser(t.db, user.id)).twoFactorTotpLastStep).toEqual(expect.any(Number));

      // Mã vừa dùng để bật TOTP không dùng lại được để đăng nhập
      const first = await startLogin(new Client(t.server), email, password);
      fail(
        await new Client(t.server).post('/auth/2fa/verify', {
          tempToken: first.tempToken,
          method: 'totp',
          code: current,
        }),
        400,
        'twoFactor.codeInvalid',
      );
      ok(
        await new Client(t.server).post('/auth/2fa/verify', {
          tempToken: first.tempToken,
          method: 'totp',
          code: next,
        }),
      );

      // Đã dùng mã bước sau thì mã bước trước (vẫn trong khoảng lệch đồng hồ) cũng bị từ chối
      fail(
        await client.post('/me/2fa/reauth', { method: 'totp', code: current }),
        400,
        'twoFactor.codeInvalid',
      );
      fail(
        await client.post('/me/2fa/reauth', { method: 'totp', code: next }),
        400,
        'twoFactor.codeInvalid',
      );
    });

    it('2 request gửi cùng lúc với cùng 1 mã: chỉ 1 request qua', async () => {
      const { client, email, password } = await signedInClient(t);
      const { next } = await enableWithCurrentCode(client);
      const a = await startLogin(new Client(t.server), email, password);
      const b = await startLogin(new Client(t.server), email, password);
      const results = await Promise.all(
        [a, b].map(({ tempToken }) =>
          new Client(t.server).post('/auth/2fa/verify', { tempToken, method: 'totp', code: next }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    });

    it('gỡ TOTP rồi thiết lập lại: secret mới không bị chặn bởi bước của secret cũ', async () => {
      const { client, user } = await signedInClient(t);
      const { next } = await enableWithCurrentCode(client);
      const reauth = ok(await client.post('/me/2fa/reauth', { method: 'totp', code: next }));
      client.reauthToken = reauth.reauthToken;
      ok(await client.delete('/me/2fa/totp'), 204);
      expect((await reloadUser(t.db, user.id)).twoFactorTotpLastStep).toBeNull();

      // Secret mới: mã bước hiện tại dùng được dù bước này cũ hơn bước đã dùng với secret cũ
      const setup = ok(await client.post('/me/2fa/totp/setup'));
      ok(await client.post('/me/2fa/totp/enable', { code: totpCode(setup.secret) }));
    });
  });

  describe('Bật TOTP ở trang tài khoản', () => {
    it('trạng thái ban đầu: chưa bật, đủ phương thức khả dụng', async () => {
      const { client } = await signedInClient(t);
      const status = ok(await client.get('/me/2fa'));
      expect(status).toMatchObject({
        enabled: false,
        defaultMethod: null,
        availableMethods: ['passkey', 'totp', 'email'],
        totp: { enabled: false },
        email: { enabled: false, canEnable: true },
        passkeys: [],
        backupCodesRemaining: 0,
        requiredMethods: null,
      });
    });

    it('thiết lập → nhập mã đúng → bật, nhận 8 mã dự phòng; secret được mã hoá trong DB', async () => {
      const { client, user } = await signedInClient(t);
      const setup = ok(await client.post('/me/2fa/totp/setup'));
      expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
      expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      expect(setup.otpauthUrl).toContain(
        encodeURIComponent(TEST_ENV.APP_NAME).replace(/%20/g, '%20'),
      );
      expect(setup.qrCode).toMatch(/^data:image\/png;base64,/);

      const stored = await reloadUser(t.db, user.id);
      expect(stored.twoFactorSecret).not.toContain(setup.secret);
      expect(stored.twoFactorSecret!.split(':')).toHaveLength(3);
      expect(stored.twoFactorEnabled).toBe(false);

      fail(
        await client.post('/me/2fa/totp/enable', { code: wrongTotpCode(setup.secret) }),
        400,
        'twoFactor.codeInvalid',
      );
      fail(await client.post('/me/2fa/totp/enable', { code: 'abc' }), 422);

      const { backupCodes } = ok(
        await client.post('/me/2fa/totp/enable', { code: totpCode(setup.secret) }),
      );
      expect(backupCodes).toHaveLength(8);
      for (const c of backupCodes) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(new Set(backupCodes).size).toBe(8);

      const status = ok(await client.get('/me/2fa'));
      expect(status).toMatchObject({
        enabled: true,
        defaultMethod: 'totp',
        totp: { enabled: true },
        backupCodesRemaining: 8,
      });
      expect(ok(await client.get('/auth/me')).twoFactorEnabled).toBe(true);

      // Mã dự phòng chỉ lưu hash
      const rows = await t.db
        .select()
        .from(twoFactorBackupCodes)
        .where(eq(twoFactorBackupCodes.userId, user.id));
      expect(rows).toHaveLength(8);
      for (const r of rows) expect(backupCodes).not.toContain(r.codeHash);

      const notes = await t.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, user.id));
      expect(notes.some((n) => n.title.includes('xác thực 2 lớp'))).toBe(true);
    });

    it('bật khi chưa tạo QR → 400 notSetup', async () => {
      const { client } = await signedInClient(t);
      fail(await client.post('/me/2fa/totp/enable', { code: '123456' }), 400, 'twoFactor.notSetup');
    });

    it('chấp nhận lệch đồng hồ ±1 bước (30 giây), từ chối lệch 3 bước', async () => {
      const { client } = await signedInClient(t);
      const setup = ok(await client.post('/me/2fa/totp/setup'));
      fail(
        await client.post('/me/2fa/totp/enable', { code: totpCode(setup.secret, -3) }),
        400,
        'twoFactor.codeInvalid',
      );
      ok(await client.post('/me/2fa/totp/enable', { code: totpCode(setup.secret, -1) }));
    });

    it('đã bật: thiết lập lại cần xác minh lại; xác minh xong thì báo đã bật (409)', async () => {
      const { client } = await signedInClient(t);
      const { secret } = await enableTotp(client);
      fail(await client.post('/me/2fa/totp/setup'), 403, 'twoFactor.reauthRequired');
      await reauthWithTotp(client, secret);
      fail(await client.post('/me/2fa/totp/setup'), 409, 'twoFactor.alreadyEnabled');
    });
  });

  describe('Đăng nhập với TOTP', () => {
    it('mật khẩu đúng → requires2fa (không có access token / cookie), nhập mã → vào được', async () => {
      const { client, email, password, user } = await signedInClient(t);
      const { secret } = await enableTotp(client);

      const browser = new Client(t.server);
      const res = await browser.login(email, password);
      const pending = ok(res);
      expect(pending).toMatchObject({
        status: 'requires2fa',
        methods: ['totp'],
        defaultMethod: 'totp',
      });
      expect(pending).not.toHaveProperty('accessToken');
      expect(pending).not.toHaveProperty('emailHint');
      expect(res.headers['set-cookie']).toBeUndefined();

      // Token tạm không phải access token
      browser.accessToken = pending.tempToken;
      fail(await browser.get('/auth/me'), 401);
      browser.accessToken = null;

      const done = await browser.post('/auth/2fa/verify', {
        tempToken: pending.tempToken,
        method: 'totp',
        code: totpCode(secret),
      });
      expect(ok(done)).toMatchObject({ status: 'success', user: { email } });
      expect(String(done.headers['set-cookie'])).toMatch(/rt_user=/);
      browser.remember(done);
      ok(await browser.get('/auth/me'));

      const [history] = await t.db
        .select()
        .from(loginHistories)
        .where(and(eq(loginHistories.userId, user.id), eq(loginHistories.twoFactorMethod, 'totp')));
      expect(history).toBeDefined();
      const list = ok(await browser.get('/me/login-history'));
      expect(
        list.some((h: { twoFactorMethod: string | null }) => h.twoFactorMethod === 'totp'),
      ).toBe(true);
    });

    it('không truyền method: mã 6 số được hiểu là TOTP', async () => {
      const { client, email, password } = await signedInClient(t);
      const { secret } = await enableTotp(client);
      const { tempToken } = await startLogin(new Client(t.server), email, password);
      ok(
        await new Client(t.server).post('/auth/2fa/verify', { tempToken, code: totpCode(secret) }),
      );
    });

    it('mã sai → 400; phương thức chưa bật → 400 methodNotEnabled', async () => {
      const { client, email, password } = await signedInClient(t);
      const { secret } = await enableTotp(client);
      const { tempToken } = await startLogin(new Client(t.server), email, password);
      const c = new Client(t.server);
      fail(
        await c.post('/auth/2fa/verify', {
          tempToken,
          method: 'totp',
          code: wrongTotpCode(secret),
        }),
        400,
        'twoFactor.codeInvalid',
      );
      fail(
        await c.post('/auth/2fa/verify', { tempToken, method: 'email', code: '123456' }),
        400,
        'twoFactor.methodNotEnabled',
      );
      fail(
        await c.post('/auth/2fa/passkey/options', { tempToken }),
        400,
        'twoFactor.methodNotEnabled',
      );
      fail(await c.post('/auth/2fa/email/send', { tempToken }), 400, 'twoFactor.methodNotEnabled');
    });

    it('khoá thử mã sau 10 lần sai (429), kể cả khi mã sau đó đúng', async () => {
      const { client, email, password } = await signedInClient(t);
      const { secret } = await enableTotp(client);
      const { tempToken } = await startLogin(new Client(t.server), email, password);
      const c = new Client(t.server);
      for (let i = 0; i < 10; i++) {
        fail(await c.post('/auth/2fa/verify', { tempToken, code: wrongTotpCode(secret) }), 400);
      }
      fail(await c.post('/auth/2fa/verify', { tempToken, code: totpCode(secret) }), 429);
    });

    it('token tạm: giả / của app khác / hết hạn / khác loại đều bị từ chối', async () => {
      const { client, email, password, user } = await signedInClient(t, { admin: true });
      const { secret } = await enableTotp(client);
      const code = totpCode(secret);
      const c = new Client(t.server);

      fail(
        await c.post('/auth/2fa/verify', { tempToken: 'garbage', code }),
        401,
        'twoFactor.tokenInvalid',
      );

      // Token tạo ở app admin không dùng được ở app user
      const admin = new Client(t.server, 'admin');
      const adminPending = ok(await admin.login(email, password));
      fail(
        await c.post('/auth/2fa/verify', { tempToken: adminPending.tempToken, code }),
        401,
        'twoFactor.tokenInvalid',
      );
      ok(await admin.post('/auth/2fa/verify', { tempToken: adminPending.tempToken, code }));

      // Token hết hạn
      const expired = await signJwt({
        subject: user.id,
        audience: '2fa-pending',
        secret: TEST_ENV.JWT_SECRET,
        expiresIn: Math.floor(Date.now() / 1000) - 60,
        claims: { app: 'user', purpose: 'verify' },
      });
      fail(
        await c.post('/auth/2fa/verify', { tempToken: expired, code }),
        401,
        'twoFactor.tokenInvalid',
      );

      // Ký bằng secret khác
      const forged = await signJwt({
        subject: user.id,
        audience: '2fa-pending',
        secret: 'another-secret-another-secret-another-secret',
        expiresIn: '5m',
        claims: { app: 'user', purpose: 'verify' },
      });
      fail(
        await c.post('/auth/2fa/verify', { tempToken: forged, code }),
        401,
        'twoFactor.tokenInvalid',
      );

      // Access token không dùng thay token tạm
      fail(
        await c.post('/auth/2fa/verify', { tempToken: client.accessToken, code }),
        401,
        'twoFactor.tokenInvalid',
      );
    });

    it('tài khoản bị khoá sau bước mật khẩu → không qua được bước 2FA', async () => {
      const { client, email, password, user } = await signedInClient(t);
      const { secret } = await enableTotp(client);
      const { tempToken } = await startLogin(new Client(t.server), email, password);
      await t.db.update(users).set({ isActive: false }).where(eq(users.id, user.id));
      fail(
        await new Client(t.server).post('/auth/2fa/verify', { tempToken, code: totpCode(secret) }),
        403,
        'auth.accountLocked',
      );
    });

    it('2FA bị admin tắt trong lúc chờ → token tạm hết tác dụng', async () => {
      const { client, email, password, user } = await signedInClient(t);
      const { secret } = await enableTotp(client);
      const { tempToken } = await startLogin(new Client(t.server), email, password);
      await t.db
        .update(users)
        .set({ twoFactorEnabled: false, twoFactorTotpEnabled: false })
        .where(eq(users.id, user.id));
      fail(
        await new Client(t.server).post('/auth/2fa/verify', { tempToken, code: totpCode(secret) }),
        400,
        'twoFactor.notEnabled',
      );
    });
  });

  describe('Mã dự phòng', () => {
    it('đăng nhập bằng mã dự phòng (không phân biệt hoa thường / dấu gạch); mỗi mã dùng 1 lần', async () => {
      const { client, email, password, user } = await signedInClient(t);
      const { backupCodes } = await enableTotp(client);
      const code = backupCodes![0]!;

      const first = await startLogin(new Client(t.server), email, password);
      ok(
        await new Client(t.server).post('/auth/2fa/verify', {
          tempToken: first.tempToken,
          method: 'backup',
          code: code.replace('-', '').toLowerCase(),
        }),
      );
      const second = await startLogin(new Client(t.server), email, password);
      fail(
        await new Client(t.server).post('/auth/2fa/verify', { tempToken: second.tempToken, code }),
        400,
        'twoFactor.codeInvalid',
      );

      // Không truyền method: chuỗi không phải 6 số được hiểu là mã dự phòng
      ok(
        await new Client(t.server).post('/auth/2fa/verify', {
          tempToken: second.tempToken,
          code: backupCodes![1],
        }),
      );
      expect(ok(await client.get('/me/2fa')).backupCodesRemaining).toBe(6);

      const history = await t.db
        .select()
        .from(loginHistories)
        .where(eq(loginHistories.userId, user.id));
      expect(history.filter((h) => h.twoFactorMethod === 'backup')).toHaveLength(2);
    });

    it('mã dự phòng của user khác không dùng được', async () => {
      const a = await signedInClient(t);
      const { backupCodes } = await enableTotp(a.client);
      const b = await signedInClient(t);
      await enableTotp(b.client);
      const { tempToken } = await startLogin(new Client(t.server), b.email, b.password);
      fail(
        await new Client(t.server).post('/auth/2fa/verify', { tempToken, code: backupCodes![0] }),
        400,
        'twoFactor.codeInvalid',
      );
    });

    it('tạo lại mã dự phòng cần xác minh lại; mã cũ mất hiệu lực', async () => {
      const { client, email, password } = await signedInClient(t);
      const { secret, backupCodes } = await enableTotp(client);
      fail(await client.post('/me/2fa/backup-codes'), 403, 'twoFactor.reauthRequired');
      await reauthWithTotp(client, secret);
      const fresh = ok(await client.post('/me/2fa/backup-codes')).backupCodes as string[];
      expect(fresh).toHaveLength(8);
      expect(fresh).not.toContain(backupCodes![0]);

      const { tempToken } = await startLogin(new Client(t.server), email, password);
      const c = new Client(t.server);
      fail(
        await c.post('/auth/2fa/verify', { tempToken, code: backupCodes![0] }),
        400,
        'twoFactor.codeInvalid',
      );
      ok(await c.post('/auth/2fa/verify', { tempToken, code: fresh[0] }));
    });

    it('xác minh lại bằng mã dự phòng cũng được (và tiêu hao mã đó)', async () => {
      const { client } = await signedInClient(t);
      const { backupCodes } = await enableTotp(client);
      ok(await client.post('/me/2fa/reauth', { method: 'backup', code: backupCodes![0] }));
      fail(
        await client.post('/me/2fa/reauth', { method: 'backup', code: backupCodes![0] }),
        400,
        'twoFactor.codeInvalid',
      );
    });
  });

  describe('Token xác minh lại (x-reauth-token)', () => {
    it('chỉ có hiệu lực cho đúng user, đúng app, còn hạn, đúng loại', async () => {
      const a = await signedInClient(t);
      const { secret } = await enableTotp(a.client);
      const b = await signedInClient(t);
      const bSecret = (await enableTotp(b.client)).secret;

      fail(
        await a.client.post('/me/2fa/reauth', { method: 'totp', code: wrongTotpCode(secret) }),
        400,
        'twoFactor.codeInvalid',
      );
      const { reauthToken, expiresIn } = ok(
        await a.client.post('/me/2fa/reauth', { method: 'totp', code: totpCode(secret) }),
      );
      expect(expiresIn).toBe(300);

      // Token của A không dùng được cho B
      b.client.reauthToken = reauthToken;
      fail(await b.client.post('/me/2fa/backup-codes'), 403, 'twoFactor.reauthRequired');
      await reauthWithTotp(b.client, bSecret);
      ok(await b.client.post('/me/2fa/backup-codes'));

      // Hết hạn
      a.client.reauthToken = await signJwt({
        subject: a.user.id,
        audience: '2fa-reauth',
        secret: TEST_ENV.JWT_SECRET,
        expiresIn: Math.floor(Date.now() / 1000) - 1,
        claims: { app: 'user' },
      });
      fail(await a.client.post('/me/2fa/backup-codes'), 403, 'twoFactor.reauthRequired');

      // Token của app admin
      a.client.reauthToken = await signJwt({
        subject: a.user.id,
        audience: '2fa-reauth',
        secret: TEST_ENV.JWT_SECRET,
        expiresIn: '5m',
        claims: { app: 'admin' },
      });
      fail(await a.client.post('/me/2fa/backup-codes'), 403, 'twoFactor.reauthRequired');

      // Access token / token tạm không thay được token xác minh lại
      a.client.reauthToken = a.client.accessToken;
      fail(await a.client.post('/me/2fa/backup-codes'), 403, 'twoFactor.reauthRequired');

      a.client.reauthToken = reauthToken;
      ok(await a.client.post('/me/2fa/backup-codes'));
    });

    it('xác minh lại bằng phương thức chưa bật → 400', async () => {
      const { client } = await signedInClient(t);
      await enableTotp(client);
      fail(
        await client.post('/me/2fa/reauth', { method: 'email', code: '123456' }),
        400,
        'twoFactor.methodNotEnabled',
      );
      fail(
        await client.post('/me/2fa/reauth/prepare', { method: 'passkey' }),
        400,
        'twoFactor.methodNotEnabled',
      );
    });

    it('cần đăng nhập', async () => {
      fail(
        await new Client(t.server).post('/me/2fa/reauth', { method: 'totp', code: '123456' }),
        401,
      );
      fail(await new Client(t.server).get('/me/2fa'), 401);
    });
  });

  it('user chưa bật 2FA không bị đòi xác minh lại khi bật phương thức đầu tiên', async () => {
    const { client } = await signedInClient(t);
    ok(await client.post('/me/2fa/totp/setup'));
    const user = await createUser(t.db);
    expect(user.email).toBeTruthy();
  });
});

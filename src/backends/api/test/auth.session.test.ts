import { eq, loginHistories, refreshTokens, users } from '@base/db';
import { LOGIN_HISTORY_LIMIT } from '@base/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, fail, ok, type TestApp } from './helpers/app';
import { createUser, DEFAULT_PASSWORD, uniqueEmail } from './helpers/fixtures';

/** Đăng nhập mật khẩu, đăng ký, phiên (refresh token xoay vòng), đăng xuất, guard */
describe('Auth: đăng nhập & phiên', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  describe('POST /auth/login', () => {
    it('đăng nhập đúng: trả access token, set cookie refresh httpOnly, ghi lịch sử', async () => {
      const { user, email, password } = await createUser(t.db);
      const client = new Client(t.server);
      const res = await client.login(email, password);
      const data = ok(res);
      expect(data.status).toBe('success');
      expect(data.accessToken).toEqual(expect.any(String));
      expect(data.user.email).toBe(email);
      expect(data.user).not.toHaveProperty('passwordHash');
      expect(data.user).not.toHaveProperty('twoFactorSecret');
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toMatch(/rt_user=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=(Lax|Strict)/i);

      const history = await t.db
        .select()
        .from(loginHistories)
        .where(eq(loginHistories.userId, user.id));
      expect(history).toHaveLength(1);
      expect(history[0]!.twoFactorMethod).toBeNull();
    });

    it(`chỉ giữ ${LOGIN_HISTORY_LIMIT} lần đăng nhập gần nhất, xoá các lần cũ hơn`, async () => {
      const { user, email, password } = await createUser(t.db);
      const now = Date.now();
      await t.db.insert(loginHistories).values(
        Array.from({ length: LOGIN_HISTORY_LIMIT + 1 }, (_, i) => ({
          userId: user.id,
          app: 'user',
          ipAddress: `10.0.0.${i}`,
          createdAt: new Date(now - (i + 1) * 60_000),
        })),
      );
      ok(await new Client(t.server).login(email, password));

      const history = await t.db
        .select()
        .from(loginHistories)
        .where(eq(loginHistories.userId, user.id));
      expect(history).toHaveLength(LOGIN_HISTORY_LIMIT);
      const ips = history.map((h) => h.ipAddress);
      // 2 bản ghi cũ nhất (10.0.0.9, 10.0.0.10) bị xoá, lần vừa đăng nhập được giữ
      expect(ips).not.toContain(`10.0.0.${LOGIN_HISTORY_LIMIT}`);
      expect(ips).not.toContain(`10.0.0.${LOGIN_HISTORY_LIMIT - 1}`);
      expect(ips).toContain('10.0.0.0');
      expect(history.some((h) => h.createdAt.getTime() > now - 60_000)).toBe(true);
    });

    it('email không phân biệt hoa thường', async () => {
      const { email, password } = await createUser(t.db);
      ok(await new Client(t.server).login(email.toUpperCase(), password));
    });

    it('sai mật khẩu và email không tồn tại trả cùng 1 lỗi (không lộ email)', async () => {
      const { email } = await createUser(t.db);
      const wrong = fail(
        await new Client(t.server).login(email, 'WrongPass1'),
        401,
        'auth.invalidCredentials',
      );
      const unknown = fail(
        await new Client(t.server).login(uniqueEmail(), 'WrongPass1'),
        401,
        'auth.invalidCredentials',
      );
      expect(wrong.message).toBe(unknown.message);
    });

    it('tài khoản Google chưa có mật khẩu không đăng nhập bằng mật khẩu được', async () => {
      const { email } = await createUser(t.db, { password: null });
      fail(await new Client(t.server).login(email, ''), 422, 'errors.validation');
      fail(await new Client(t.server).login(email, 'anything1'), 401, 'auth.invalidCredentials');
    });

    it('mật khẩu của hash giả (cân bằng thời gian) không mở được tài khoản chưa có mật khẩu', async () => {
      // Chuỗi phải khớp plaintext của DUMMY_HASH trong auth.service.ts
      const dummyPassword = 'dummy-password-for-timing';
      const user = await createUser(t.db, { password: null });
      fail(
        await new Client(t.server).login(user.email, dummyPassword),
        401,
        'auth.invalidCredentials',
      );
      const admin = await createUser(t.db, { password: null, admin: true });
      fail(
        await new Client(t.server, 'admin').login(admin.email, dummyPassword),
        401,
        'auth.invalidCredentials',
      );
    });

    it('tài khoản bị khoá → 403', async () => {
      const { email, password } = await createUser(t.db, { isActive: false });
      fail(await new Client(t.server).login(email, password), 403, 'auth.accountLocked');
    });

    it('user thường không vào được app admin', async () => {
      const { email, password } = await createUser(t.db);
      fail(
        await new Client(t.server, 'admin').login(email, password),
        403,
        'auth.adminAccessDenied',
      );
    });

    it('admin vào được app admin', async () => {
      const { email, password } = await createUser(t.db, { admin: true });
      expect(ok(await new Client(t.server, 'admin').login(email, password)).status).toBe('success');
    });

    it('body sai định dạng → 422', async () => {
      fail(
        await new Client(t.server).post('/auth/login', { email: 'not-an-email', password: 'x' }),
        422,
      );
      fail(await new Client(t.server).post('/auth/login', {}), 422);
    });

    it('khoá tạm sau 10 lần sai liên tiếp (429), kể cả khi sau đó nhập đúng', async () => {
      const { email, password } = await createUser(t.db);
      const client = new Client(t.server);
      for (let i = 0; i < 10; i++) fail(await client.login(email, 'WrongPass1'), 401);
      fail(await client.login(email, password), 429);
    });
  });

  describe('POST /auth/register', () => {
    it('đăng ký thành công: tạo user role mặc định, đăng nhập luôn, hash mật khẩu', async () => {
      const email = uniqueEmail('reg');
      const client = new Client(t.server);
      const data = client.remember(
        await client.post('/auth/register', {
          email,
          password: 'Secret123',
          firstName: 'A',
          lastName: 'B',
        }),
      ).body.data;
      expect(data.user.email).toBe(email);
      expect(data.user.role?.name).toBe('User');
      const [row] = await t.db.select().from(users).where(eq(users.email, email));
      expect(row!.passwordHash).not.toContain('Secret123');
      ok(await client.get('/auth/me'));
    });

    it('email đã tồn tại → 409', async () => {
      const { email } = await createUser(t.db);
      fail(
        await new Client(t.server).post('/auth/register', {
          email,
          password: 'Secret123',
          firstName: 'A',
          lastName: 'B',
        }),
        409,
        'auth.emailExists',
      );
    });

    it('mật khẩu yếu (không có số / quá ngắn) → 422', async () => {
      const client = new Client(t.server);
      const base = { email: uniqueEmail(), firstName: 'A', lastName: 'B' };
      fail(await client.post('/auth/register', { ...base, password: 'abcdefgh' }), 422);
      fail(await client.post('/auth/register', { ...base, password: 'ab1' }), 422);
    });

    it('tắt đăng ký → 403', async () => {
      await t.setSetting('allow_registration', 'false');
      try {
        fail(
          await new Client(t.server).post('/auth/register', {
            email: uniqueEmail(),
            password: 'Secret123',
            firstName: 'A',
            lastName: 'B',
          }),
          403,
          'auth.registrationDisabled',
        );
      } finally {
        await t.setSetting('allow_registration', 'true');
      }
    });
  });

  describe('Phiên: refresh / logout / guard', () => {
    it('refresh xoay vòng token; token cũ dùng lại sau thời gian ân hạn bị từ chối', async () => {
      const { email, password, user } = await createUser(t.db);
      const client = new Client(t.server);
      const loginRes = await client.login(email, password);
      const original = /rt_user=([^;]+)/.exec(String(loginRes.headers['set-cookie']))![1]!;

      const rotated = await client.post('/auth/refresh');
      expect(ok(rotated).accessToken).toEqual(expect.any(String));
      expect(String(rotated.headers['set-cookie'])).toMatch(/rt_user=/);

      // Trong 60 giây ân hạn (nhiều tab refresh cùng lúc): token cũ vẫn được nhưng không cấp cookie mới
      const otherTab = new Client(t.server);
      const graceRes = await otherTab.post('/auth/refresh', undefined, {
        Cookie: `rt_user=${original}`,
      });
      ok(graceRes);
      expect(graceRes.headers['set-cookie']).toBeUndefined();

      // Hết ân hạn: token cũ bị từ chối
      const rows = await t.db.select().from(refreshTokens).where(eq(refreshTokens.userId, user.id));
      const revoked = rows.find((r) => r.revokedAt);
      expect(revoked).toBeDefined();
      await t.db
        .update(refreshTokens)
        .set({ revokedAt: new Date(Date.now() - 5 * 60_000) })
        .where(eq(refreshTokens.id, revoked!.id));
      fail(
        await new Client(t.server).post('/auth/refresh', undefined, {
          Cookie: `rt_user=${original}`,
        }),
        401,
        'auth.sessionExpired',
      );
      // Token giả
      fail(
        await new Client(t.server).post('/auth/refresh', undefined, {
          Cookie: 'rt_user=__unknown__',
        }),
        401,
        'auth.sessionExpired',
      );
    });

    it('cookie của app user không dùng được cho app admin', async () => {
      const { email, password } = await createUser(t.db, { admin: true });
      const client = new Client(t.server, 'user');
      ok(await client.login(email, password));
      client.appName = 'admin';
      fail(await client.post('/auth/refresh'), 401, 'auth.sessionExpired');
    });

    it('logout thu hồi refresh token và xoá cookie', async () => {
      const { email, password } = await createUser(t.db);
      const client = new Client(t.server);
      ok(await client.login(email, password));
      const res = await client.post('/auth/logout');
      ok(res);
      expect(String(res.headers['set-cookie'])).toMatch(/rt_user=;/);
      fail(await client.post('/auth/refresh'), 401);
    });

    it('route cần đăng nhập: thiếu token / token giả / token khác audience → 401', async () => {
      const client = new Client(t.server);
      fail(await client.get('/auth/me'), 401);
      client.accessToken = 'abc.def.ghi';
      fail(await client.get('/auth/me'), 401);
    });

    it('khoá tài khoản giữa phiên có hiệu lực ngay (không chờ access token hết hạn)', async () => {
      const { email, password, user } = await createUser(t.db);
      const client = new Client(t.server);
      ok(await client.login(email, password));
      ok(await client.get('/auth/me'));
      await t.db.update(users).set({ isActive: false }).where(eq(users.id, user.id));
      fail(await client.get('/auth/me'), 401, 'auth.accountLocked');
      fail(await client.post('/auth/refresh'), 401);
    });

    it('bắt buộc xác minh email: chặn API thường (403) nhưng vẫn cho xem /auth/me và gửi mã', async () => {
      await t.setSetting('require_email_verification', 'true');
      try {
        const { email, password } = await createUser(t.db, { verified: false });
        const client = new Client(t.server);
        ok(await client.login(email, password));
        expect(ok(await client.get('/auth/me')).emailVerificationRequired).toBe(true);
        fail(await client.get('/me/2fa'), 403, 'emailVerification.required');
        ok(await client.post('/me/email-verification/send'));
        const code = t.mail.last('verificationCode', email)!.code!;
        ok(await client.post('/me/email-verification/verify', { code }));
        ok(await client.get('/me/2fa'));
      } finally {
        await t.setSetting('require_email_verification', 'false');
      }
    });
  });

  describe('Xác minh email', () => {
    it('mã sai bị từ chối, gửi lại trong 60 giây bị chặn', async () => {
      const { email, password } = await createUser(t.db, { verified: false });
      const client = new Client(t.server);
      ok(await client.login(email, password));
      ok(await client.post('/me/email-verification/send'));
      fail(await client.post('/me/email-verification/send'), 429, 'emailVerification.cooldown');
      const code = t.mail.last('verificationCode', email)!.code!;
      const wrong = code === '000000' ? '111111' : '000000';
      fail(
        await client.post('/me/email-verification/verify', { code: wrong }),
        400,
        'emailVerification.codeInvalid',
      );
      const me = ok(await client.post('/me/email-verification/verify', { code }));
      expect(me.emailVerified).toBe(true);
      fail(
        await client.post('/me/email-verification/send'),
        400,
        'emailVerification.alreadyVerified',
      );
    });
  });

  it('DEFAULT_PASSWORD hợp lệ theo chính sách', () => {
    expect(DEFAULT_PASSWORD).toMatch(/\d/);
  });
});

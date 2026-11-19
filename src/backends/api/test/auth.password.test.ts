import { eq, notifications, passwordResetTokens, refreshTokens } from '@base/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, fail, ok, type TestApp } from './helpers/app';
import { createUser, uniqueEmail } from './helpers/fixtures';

const tokenFrom = (link: string) => new URL(link).searchParams.get('token')!;

/** Quên mật khẩu, đặt lại mật khẩu, đổi mật khẩu */
describe('Auth: mật khẩu', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  describe('Quên / đặt lại mật khẩu', () => {
    it('gửi link tới email; email không tồn tại vẫn trả thành công nhưng không gửi', async () => {
      const { email } = await createUser(t.db);
      const client = new Client(t.server);
      const known = ok(await client.post('/auth/forgot-password', { email }));
      const unknownEmail = uniqueEmail('ghost');
      const unknown = ok(await client.post('/auth/forgot-password', { email: unknownEmail }));
      expect(known.message).toBe(unknown.message);
      expect(t.mail.count('resetPassword', email)).toBe(1);
      expect(t.mail.count('resetPassword', unknownEmail)).toBe(0);
      const link = t.mail.last('resetPassword', email)!.link!;
      expect(link.startsWith('http://localhost:5173/reset-password?token=')).toBe(true);
    });

    it('link theo app: yêu cầu từ app admin trỏ về ADMIN_APP_URL', async () => {
      const { email } = await createUser(t.db, { admin: true });
      ok(await new Client(t.server, 'admin').post('/auth/forgot-password', { email }));
      expect(t.mail.last('resetPassword', email)!.link).toMatch(
        /^http:\/\/localhost:5174\/reset-password/,
      );
    });

    it('tài khoản bị khoá không nhận link', async () => {
      const { email } = await createUser(t.db, { isActive: false });
      ok(await new Client(t.server).post('/auth/forgot-password', { email }));
      expect(t.mail.count('resetPassword', email)).toBe(0);
    });

    it('chỉ lưu hash của token trong DB', async () => {
      const { email, user } = await createUser(t.db);
      ok(await new Client(t.server).post('/auth/forgot-password', { email }));
      const token = tokenFrom(t.mail.last('resetPassword', email)!.link!);
      const [row] = await t.db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));
      expect(row!.tokenHash).not.toBe(token);
      expect(row!.tokenHash).toHaveLength(64);
    });

    it('đặt lại mật khẩu: đăng nhập bằng mật khẩu mới, mật khẩu cũ hết hiệu lực, mọi phiên bị thu hồi', async () => {
      const { email, password, user } = await createUser(t.db);
      const session = new Client(t.server);
      ok(await session.login(email, password));

      ok(await new Client(t.server).post('/auth/forgot-password', { email }));
      const token = tokenFrom(t.mail.last('resetPassword', email)!.link!);
      ok(
        await new Client(t.server).post('/auth/reset-password', { token, password: 'BrandNew123' }),
      );

      fail(await new Client(t.server).login(email, password), 401, 'auth.invalidCredentials');
      ok(await new Client(t.server).login(email, 'BrandNew123'));
      fail(await session.post('/auth/refresh'), 401, 'auth.sessionExpired');

      const notes = await t.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, user.id));
      expect(notes.some((n) => n.type === 'warning')).toBe(true);
    });

    it('token chỉ dùng được 1 lần; yêu cầu mới vô hiệu hoá các token cũ khi đặt lại', async () => {
      const { email } = await createUser(t.db);
      const client = new Client(t.server);
      ok(await client.post('/auth/forgot-password', { email }));
      const first = tokenFrom(t.mail.last('resetPassword', email)!.link!);
      ok(await client.post('/auth/forgot-password', { email }));
      const second = tokenFrom(t.mail.last('resetPassword', email)!.link!);

      ok(await client.post('/auth/reset-password', { token: second, password: 'Another123' }));
      fail(
        await client.post('/auth/reset-password', { token: second, password: 'Another456' }),
        400,
        'auth.resetTokenInvalid',
      );
      fail(
        await client.post('/auth/reset-password', { token: first, password: 'Another789' }),
        400,
        'auth.resetTokenInvalid',
      );
    });

    it('token hết hạn hoặc bịa → 400', async () => {
      const { email, user } = await createUser(t.db);
      ok(await new Client(t.server).post('/auth/forgot-password', { email }));
      const token = tokenFrom(t.mail.last('resetPassword', email)!.link!);
      await t.db
        .update(passwordResetTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(passwordResetTokens.userId, user.id));
      fail(
        await new Client(t.server).post('/auth/reset-password', { token, password: 'Expired123' }),
        400,
        'auth.resetTokenInvalid',
      );
      fail(
        await new Client(t.server).post('/auth/reset-password', {
          token: 'f'.repeat(64),
          password: 'Expired123',
        }),
        400,
        'auth.resetTokenInvalid',
      );
    });

    it('mật khẩu mới phải theo chính sách', async () => {
      const { email } = await createUser(t.db);
      ok(await new Client(t.server).post('/auth/forgot-password', { email }));
      const token = tokenFrom(t.mail.last('resetPassword', email)!.link!);
      fail(
        await new Client(t.server).post('/auth/reset-password', { token, password: 'short' }),
        422,
      );
    });

    it('giới hạn 3 yêu cầu / email / giờ', async () => {
      const { email } = await createUser(t.db);
      const client = new Client(t.server);
      for (let i = 0; i < 3; i++) ok(await client.post('/auth/forgot-password', { email }));
      fail(await client.post('/auth/forgot-password', { email }), 429);
    });
  });

  describe('Đổi mật khẩu (POST /me/change-password)', () => {
    it('cần mật khẩu hiện tại đúng; đổi xong đăng xuất thiết bị khác, giữ phiên hiện tại', async () => {
      const { email, password, user } = await createUser(t.db);
      const current = new Client(t.server);
      ok(await current.login(email, password));
      const other = new Client(t.server);
      ok(await other.login(email, password));

      fail(
        await current.post('/me/change-password', {
          currentPassword: 'Wrong1234',
          newPassword: 'Changed123',
        }),
        400,
        'account.currentPasswordIncorrect',
      );
      ok(
        await current.post('/me/change-password', {
          currentPassword: password,
          newPassword: 'Changed123',
        }),
        204,
      );

      ok(await current.post('/auth/refresh'));
      fail(await other.post('/auth/refresh'), 401, 'auth.sessionExpired');
      ok(await new Client(t.server).login(email, 'Changed123'));

      const active = (
        await t.db.select().from(refreshTokens).where(eq(refreshTokens.userId, user.id))
      ).filter((r) => !r.revokedAt);
      expect(active.length).toBeGreaterThanOrEqual(1);
    });

    it('mật khẩu mới trùng mật khẩu cũ → 400', async () => {
      const { email, password } = await createUser(t.db);
      const client = new Client(t.server);
      ok(await client.login(email, password));
      fail(
        await client.post('/me/change-password', {
          currentPassword: password,
          newPassword: password,
        }),
        400,
        'account.samePassword',
      );
    });

    it('tài khoản Google (chưa có mật khẩu) đặt mật khẩu lần đầu không cần mật khẩu cũ', async () => {
      const { user } = await createUser(t.db, { password: null });
      // Đăng nhập Google không chạy được trong test: cấp phiên qua access token trực tiếp
      const client = new Client(t.server);
      const { SessionService } = await import('../src/auth/session.service');
      client.accessToken = await t.app.get(SessionService).issueAccessToken(user.id);
      ok(await client.post('/me/change-password', { newPassword: 'FirstPass123' }), 204);
      ok(await new Client(t.server).login(user.email, 'FirstPass123'));
    });

    it('chặn dò mật khẩu hiện tại: 10 lần sai → 429', async () => {
      const { email, password } = await createUser(t.db);
      const client = new Client(t.server);
      ok(await client.login(email, password));
      for (let i = 0; i < 10; i++) {
        fail(
          await client.post('/me/change-password', {
            currentPassword: `Wrong${i}abc`,
            newPassword: 'Changed123',
          }),
          400,
        );
      }
      fail(
        await client.post('/me/change-password', {
          currentPassword: password,
          newPassword: 'Changed123',
        }),
        429,
      );
    });
  });
});

import { and, authChallenges, eq, loginHistories, twoFactorBackupCodes } from '@base/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, fail, ok, type TestApp } from './helpers/app';
import {
  enableEmail,
  enableTotp,
  reauthWithTotp,
  signedInClient,
  startLogin,
} from './helpers/flows';

const wrongCode = (code: string) => (code === '000000' ? '111111' : '000000');

/** 2FA bằng mã gửi qua email */
describe('2FA: Email', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  /** Lùi thời điểm gửi mã gần nhất để bỏ qua thời gian chờ 60 giây */
  async function skipCooldown(userId: string) {
    await t.db
      .update(authChallenges)
      .set({ createdAt: new Date(Date.now() - 2 * 60_000) })
      .where(eq(authChallenges.userId, userId));
  }

  describe('Bật email 2FA', () => {
    it('email chưa xác minh thì không bật được', async () => {
      const { client } = await signedInClient(t, { verified: false });
      expect(ok(await client.get('/me/2fa')).email).toMatchObject({
        enabled: false,
        canEnable: false,
      });
      fail(await client.post('/me/2fa/email/send'), 400, 'twoFactor.emailNotVerified');
      fail(
        await client.post('/me/2fa/email/enable', { code: '123456' }),
        400,
        'twoFactor.emailNotVerified',
      );
    });

    it('gửi mã → nhập đúng → bật (phương thức đầu tiên → có mã dự phòng); mã lưu dạng hash', async () => {
      const { client, email, user } = await signedInClient(t);
      const sent = ok(await client.post('/me/2fa/email/send'));
      expect(sent.cooldownSeconds).toBe(60);
      expect(sent.emailHint).not.toBe(email);
      expect(sent.emailHint).toMatch(/^\w{1,2}\*{3,}@example\.com$/);

      const mail = t.mail.last('twoFactorCode', email)!;
      expect(mail.code).toMatch(/^\d{6}$/);
      expect(mail.ipAddress).toBe(client.ip);
      const [challenge] = await t.db
        .select()
        .from(authChallenges)
        .where(eq(authChallenges.userId, user.id));
      expect(challenge!.value).not.toBe(mail.code);
      expect(challenge).toMatchObject({ type: 'email_otp', purpose: 'enable' });

      fail(
        await client.post('/me/2fa/email/enable', { code: wrongCode(mail.code!) }),
        400,
        'twoFactor.codeInvalid',
      );
      const result = ok(await client.post('/me/2fa/email/enable', { code: mail.code }));
      expect(result.backupCodes).toHaveLength(8);
      expect(ok(await client.get('/me/2fa'))).toMatchObject({
        enabled: true,
        defaultMethod: 'email',
        email: { enabled: true },
      });
    });

    it('gửi lại trong 60 giây → 429 emailCooldown', async () => {
      const { client } = await signedInClient(t);
      ok(await client.post('/me/2fa/email/send'));
      fail(await client.post('/me/2fa/email/send'), 429, 'twoFactor.emailCooldown');
    });

    it('gửi tối đa 5 lần / giờ', async () => {
      const { client, user } = await signedInClient(t);
      for (let i = 0; i < 5; i++) {
        ok(await client.post('/me/2fa/email/send'));
        await skipCooldown(user.id);
      }
      fail(await client.post('/me/2fa/email/send'), 429);
    });

    it('mã cũ hết hiệu lực khi gửi mã mới', async () => {
      const { client, email, user } = await signedInClient(t);
      ok(await client.post('/me/2fa/email/send'));
      const first = t.mail.last('twoFactorCode', email)!.code!;
      await skipCooldown(user.id);
      ok(await client.post('/me/2fa/email/send'));
      const second = t.mail.last('twoFactorCode', email)!.code!;
      if (first !== second)
        fail(
          await client.post('/me/2fa/email/enable', { code: first }),
          400,
          'twoFactor.codeInvalid',
        );
      ok(await client.post('/me/2fa/email/enable', { code: second }));
    });

    it('hệ thống không cho phép email (setting two_factor_methods) → 400 methodNotAllowed', async () => {
      await t.setSetting('two_factor_methods', 'totp,passkey');
      try {
        const { client } = await signedInClient(t);
        expect(ok(await client.get('/me/2fa')).availableMethods).toEqual(['passkey', 'totp']);
        fail(await client.post('/me/2fa/email/send'), 400, 'twoFactor.methodNotAllowed');
      } finally {
        await t.setSetting('two_factor_methods', 'totp,email,passkey');
      }
    });
  });

  describe('Đăng nhập bằng mã email', () => {
    it('requires2fa kèm email đã che; gửi mã → nhập đúng → vào được, ghi lịch sử', async () => {
      const { client, email, password, user } = await signedInClient(t);
      await enableEmail(t, client, email);

      const pending = await startLogin(new Client(t.server), email, password);
      expect(pending.methods).toEqual(['email']);
      expect(pending.defaultMethod).toBe('email');
      expect(pending.emailHint).toBeDefined();
      expect(pending.emailHint).not.toBe(email);

      const browser = new Client(t.server);
      ok(await browser.post('/auth/2fa/email/send', { tempToken: pending.tempToken }));
      const code = t.mail.last('twoFactorCode', email)!.code!;
      ok(
        await browser.post('/auth/2fa/verify', {
          tempToken: pending.tempToken,
          method: 'email',
          code,
        }),
      );

      const rows = await t.db
        .select()
        .from(loginHistories)
        .where(
          and(eq(loginHistories.userId, user.id), eq(loginHistories.twoFactorMethod, 'email')),
        );
      expect(rows).toHaveLength(1);
    });

    it('chỉ bật email: mã 6 số không kèm method được hiểu là mã email', async () => {
      const { client, email, password } = await signedInClient(t);
      await enableEmail(t, client, email);
      const { tempToken } = await startLogin(new Client(t.server), email, password);
      ok(await new Client(t.server).post('/auth/2fa/email/send', { tempToken }));
      ok(
        await new Client(t.server).post('/auth/2fa/verify', {
          tempToken,
          code: t.mail.last('twoFactorCode', email)!.code,
        }),
      );
    });

    it('mã chỉ dùng được 1 lần', async () => {
      const { client, email, password } = await signedInClient(t);
      await enableEmail(t, client, email);
      const first = await startLogin(new Client(t.server), email, password);
      ok(await new Client(t.server).post('/auth/2fa/email/send', { tempToken: first.tempToken }));
      const code = t.mail.last('twoFactorCode', email)!.code!;
      ok(
        await new Client(t.server).post('/auth/2fa/verify', {
          tempToken: first.tempToken,
          method: 'email',
          code,
        }),
      );

      const second = await startLogin(new Client(t.server), email, password);
      fail(
        await new Client(t.server).post('/auth/2fa/verify', {
          tempToken: second.tempToken,
          method: 'email',
          code,
        }),
        400,
        'twoFactor.codeInvalid',
      );
    });

    it('sai 5 lần → mã bị huỷ, nhập đúng sau đó vẫn bị từ chối', async () => {
      const { client, email, password } = await signedInClient(t);
      await enableEmail(t, client, email);
      const { tempToken } = await startLogin(new Client(t.server), email, password);
      const c = new Client(t.server);
      ok(await c.post('/auth/2fa/email/send', { tempToken }));
      const code = t.mail.last('twoFactorCode', email)!.code!;
      for (let i = 0; i < 5; i++) {
        fail(
          await c.post('/auth/2fa/verify', { tempToken, method: 'email', code: wrongCode(code) }),
          400,
        );
      }
      fail(
        await c.post('/auth/2fa/verify', { tempToken, method: 'email', code }),
        400,
        'twoFactor.codeInvalid',
      );
    });

    it('mã hết hạn (10 phút) bị từ chối', async () => {
      const { client, email, password, user } = await signedInClient(t);
      await enableEmail(t, client, email);
      const { tempToken } = await startLogin(new Client(t.server), email, password);
      ok(await new Client(t.server).post('/auth/2fa/email/send', { tempToken }));
      const code = t.mail.last('twoFactorCode', email)!.code!;
      await t.db
        .update(authChallenges)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(and(eq(authChallenges.userId, user.id), eq(authChallenges.purpose, 'login')));
      fail(
        await new Client(t.server).post('/auth/2fa/verify', { tempToken, method: 'email', code }),
        400,
        'twoFactor.codeInvalid',
      );
    });

    it('mã gửi cho mục đích khác (xác minh lại) không dùng để đăng nhập được', async () => {
      const { client, email, password } = await signedInClient(t);
      await enableEmail(t, client, email);
      ok(await client.post('/me/2fa/reauth/prepare', { method: 'email' }));
      const reauthCode = t.mail.last('twoFactorCode', email)!.code!;
      const { tempToken } = await startLogin(new Client(t.server), email, password);
      fail(
        await new Client(t.server).post('/auth/2fa/verify', {
          tempToken,
          method: 'email',
          code: reauthCode,
        }),
        400,
        'twoFactor.codeInvalid',
      );
      // Vẫn dùng được cho đúng mục đích
      const { reauthToken } = ok(
        await client.post('/me/2fa/reauth', { method: 'email', code: reauthCode }),
      );
      expect(reauthToken).toEqual(expect.any(String));
    });

    it('mã của user khác không dùng được', async () => {
      const a = await signedInClient(t);
      await enableEmail(t, a.client, a.email);
      const b = await signedInClient(t);
      await enableEmail(t, b.client, b.email);

      const pa = await startLogin(new Client(t.server), a.email, a.password);
      ok(await new Client(t.server).post('/auth/2fa/email/send', { tempToken: pa.tempToken }));
      const codeA = t.mail.last('twoFactorCode', a.email)!.code!;
      const pb = await startLogin(new Client(t.server), b.email, b.password);
      ok(await new Client(t.server).post('/auth/2fa/email/send', { tempToken: pb.tempToken }));
      const codeB = t.mail.last('twoFactorCode', b.email)!.code!;
      if (codeA !== codeB) {
        fail(
          await new Client(t.server).post('/auth/2fa/verify', {
            tempToken: pb.tempToken,
            method: 'email',
            code: codeA,
          }),
          400,
        );
      }
    });

    it('setting tắt email: user đang dùng email vẫn đăng nhập được (không bị khoá ngoài)', async () => {
      const { client, email, password } = await signedInClient(t);
      await enableEmail(t, client, email);
      await t.setSetting('two_factor_methods', 'totp');
      try {
        const { tempToken, methods } = await startLogin(new Client(t.server), email, password);
        expect(methods).toEqual(['email']);
        ok(await new Client(t.server).post('/auth/2fa/email/send', { tempToken }));
        ok(
          await new Client(t.server).post('/auth/2fa/verify', {
            tempToken,
            method: 'email',
            code: t.mail.last('twoFactorCode', email)!.code,
          }),
        );
      } finally {
        await t.setSetting('two_factor_methods', 'totp,email,passkey');
      }
    });
  });

  describe('Kết hợp với phương thức khác', () => {
    it('đã có TOTP: thêm email cần xác minh lại, không sinh lại mã dự phòng', async () => {
      const { client, email, password, user } = await signedInClient(t);
      const { secret } = await enableTotp(client);
      const before = await t.db
        .select()
        .from(twoFactorBackupCodes)
        .where(eq(twoFactorBackupCodes.userId, user.id));

      fail(await client.post('/me/2fa/email/send'), 403, 'twoFactor.reauthRequired');
      await reauthWithTotp(client, secret);
      const result = await enableEmail(t, client, email);
      expect(result.backupCodes).toBeUndefined();

      const after = await t.db
        .select()
        .from(twoFactorBackupCodes)
        .where(eq(twoFactorBackupCodes.userId, user.id));
      expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());

      const pending = await startLogin(new Client(t.server), email, password);
      expect(pending.methods).toEqual(['totp', 'email']);
      expect(pending.defaultMethod).toBe('totp');
    });

    it('gỡ email khi còn TOTP: 2FA vẫn bật; gỡ nốt TOTP: 2FA tắt, xoá mã dự phòng', async () => {
      const { client, email, user } = await signedInClient(t);
      const { secret } = await enableTotp(client);
      await reauthWithTotp(client, secret);
      await enableEmail(t, client, email);
      ok(await client.put('/me/2fa/default-method', { method: 'email' }), 204);

      ok(await client.delete('/me/2fa/email'), 204);
      let status = ok(await client.get('/me/2fa'));
      expect(status).toMatchObject({
        enabled: true,
        defaultMethod: 'totp',
        email: { enabled: false },
        backupCodesRemaining: 8,
      });

      ok(await client.delete('/me/2fa/totp'), 204);
      status = ok(await client.get('/me/2fa'));
      expect(status).toMatchObject({
        enabled: false,
        defaultMethod: null,
        totp: { enabled: false },
        backupCodesRemaining: 0,
      });
      const codes = await t.db
        .select()
        .from(twoFactorBackupCodes)
        .where(eq(twoFactorBackupCodes.userId, user.id));
      expect(codes).toHaveLength(0);
      fail(await client.delete('/me/2fa/totp'), 400, 'twoFactor.methodNotEnabled');
    });
  });
});

import { and, eq, loginHistories, passkeys } from '@base/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, fail, ok, type TestApp } from './helpers/app';
import {
  addPasskey,
  enableTotp,
  reauthWithTotp,
  signedInClient,
  startLogin,
} from './helpers/flows';
import { SoftAuthenticator } from './helpers/webauthn';

/** 2FA bằng passkey (WebAuthn) */
describe('2FA: Passkey', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  /** Lấy options đăng nhập passkey và ký bằng authenticator */
  async function passkeyLogin(email: string, password: string, auth: SoftAuthenticator) {
    const { tempToken, ...info } = await startLogin(new Client(t.server), email, password);
    const browser = new Client(t.server);
    const options = ok(await browser.post('/auth/2fa/passkey/options', { tempToken }));
    return { tempToken, info, browser, options, response: auth.authenticate(options) };
  }

  describe('Đăng ký passkey', () => {
    it('options đúng RP / user / chính sách; challenge lưu server-side', async () => {
      const { client, email } = await signedInClient(t);
      const options = ok(await client.post('/me/2fa/passkeys/options'));
      expect(options.rp).toMatchObject({ id: 'localhost', name: 'Base Web Test' });
      expect(options.user.name).toBe(email);
      expect(options.challenge).toMatch(/^[\w-]{16,}$/);
      expect(options.attestation).toBe('none');
      expect(options.authenticatorSelection).toMatchObject({
        residentKey: 'preferred',
        userVerification: 'preferred',
      });
      expect(options.excludeCredentials).toEqual([]);
      expect(options.pubKeyCredParams.some((p: { alg: number }) => p.alg === -7)).toBe(true);
    });

    it('đăng ký thành công: lưu public key, là phương thức đầu tiên → mã dự phòng, mặc định = passkey', async () => {
      const { client, user } = await signedInClient(t);
      const { authenticator, result } = await addPasskey(client, 'MacBook');
      expect(result.passkey).toMatchObject({
        name: 'MacBook',
        backedUp: false,
        deviceType: 'singleDevice',
        lastUsedAt: null,
      });
      expect(result.backupCodes).toHaveLength(8);

      const [row] = await t.db.select().from(passkeys).where(eq(passkeys.userId, user.id));
      expect(row).toMatchObject({
        credentialId: authenticator.id,
        counter: 0,
        transports: ['internal'],
      });
      expect(row!.publicKey.length).toBeGreaterThan(50);

      expect(ok(await client.get('/me/2fa'))).toMatchObject({
        enabled: true,
        defaultMethod: 'passkey',
      });
    });

    it('đăng ký lại cùng authenticator: options có excludeCredentials, server từ chối trùng (409)', async () => {
      const { client } = await signedInClient(t);
      const { authenticator } = await addPasskey(client);
      ok(
        await client.post('/me/2fa/reauth/prepare', { method: 'passkey' }).then(async (res) => {
          const options = ok(res).options;
          const reauth = ok(
            await client.post('/me/2fa/reauth', {
              method: 'passkey',
              response: authenticator.authenticate(options),
            }),
          );
          client.reauthToken = reauth.reauthToken;
          return res;
        }),
      );
      const options = ok(await client.post('/me/2fa/passkeys/options'));
      expect(options.excludeCredentials.map((c: { id: string }) => c.id)).toContain(
        authenticator.id,
      );
      fail(
        await client.post('/me/2fa/passkeys', {
          name: 'Again',
          response: authenticator.register(options),
        }),
        409,
        'twoFactor.passkeyExists',
      );
    });

    it('origin lạ (trang lừa đảo) / RP ID khác / challenge giả / thiếu User Present → bị từ chối', async () => {
      const { client } = await signedInClient(t);
      const auth = new SoftAuthenticator();
      const cases: Array<Parameters<SoftAuthenticator['register']>[1]> = [
        { origin: 'https://evil.example' },
        { rpId: 'evil.example' },
        { challenge: 'Zm9yZ2VkLWNoYWxsZW5nZS1mb3JnZWQ' },
        { type: 'webauthn.get' },
        { noUserPresence: true },
      ];
      for (const override of cases) {
        const options = ok(await client.post('/me/2fa/passkeys/options'));
        fail(
          await client.post('/me/2fa/passkeys', {
            name: 'X',
            response: auth.register(options, override),
          }),
          400,
          'twoFactor.passkeyInvalid',
        );
      }
      expect(ok(await client.get('/me/2fa')).passkeys).toHaveLength(0);
    });

    it('challenge chỉ dùng 1 lần: thất bại xong thử lại với cùng options → hết hạn', async () => {
      const { client } = await signedInClient(t);
      const auth = new SoftAuthenticator();
      const options = ok(await client.post('/me/2fa/passkeys/options'));
      fail(
        await client.post('/me/2fa/passkeys', {
          name: 'X',
          response: auth.register(options, { origin: 'https://evil.example' }),
        }),
        400,
      );
      fail(
        await client.post('/me/2fa/passkeys', { name: 'X', response: auth.register(options) }),
        400,
        'twoFactor.passkeyChallengeExpired',
      );
    });

    it('chưa xin options → 400; dữ liệu không đúng dạng → 422', async () => {
      const { client } = await signedInClient(t);
      fail(
        await client.post('/me/2fa/passkeys', {
          name: 'X',
          response: new SoftAuthenticator().register({ challenge: 'abc' }),
        }),
        400,
        'twoFactor.passkeyChallengeExpired',
      );
      fail(await client.post('/me/2fa/passkeys', { name: 'X', response: { id: 'a' } }), 422);
      fail(
        await client.post('/me/2fa/passkeys', {
          name: '',
          response: new SoftAuthenticator().register({ challenge: 'a' }),
        }),
        422,
      );
    });

    it('tối đa 10 passkey mỗi tài khoản', async () => {
      const { client, user } = await signedInClient(t);
      await t.db.insert(passkeys).values(
        Array.from({ length: 10 }, (_, i) => ({
          userId: user.id,
          credentialId: `fake-cred-${user.id}-${i}`,
          publicKey: 'AAAA',
          name: `Key ${i}`,
        })),
      );
      fail(await client.post('/me/2fa/passkeys/options'), 400, 'twoFactor.passkeyLimit');
    });

    it('setting không cho phép passkey → 400 methodNotAllowed', async () => {
      await t.setSetting('two_factor_methods', 'totp,email');
      try {
        const { client } = await signedInClient(t);
        fail(await client.post('/me/2fa/passkeys/options'), 400, 'twoFactor.methodNotAllowed');
      } finally {
        await t.setSetting('two_factor_methods', 'totp,email,passkey');
      }
    });
  });

  describe('Đăng nhập bằng passkey', () => {
    it('options chỉ liệt kê passkey của user; ký đúng → vào được, cập nhật counter + lastUsedAt', async () => {
      const { client, email, password, user } = await signedInClient(t);
      const { authenticator } = await addPasskey(client);

      const { tempToken, info, browser, options, response } = await passkeyLogin(
        email,
        password,
        authenticator,
      );
      expect(info).toMatchObject({ methods: ['passkey'], defaultMethod: 'passkey' });
      expect(options.rpId).toBe('localhost');
      expect(options.userVerification).toBe('preferred');
      expect(options.allowCredentials.map((c: { id: string }) => c.id)).toEqual([authenticator.id]);

      fail(await browser.post('/auth/2fa/passkey/verify', { response }), 422);
      const done = await browser.post('/auth/2fa/passkey/verify', { tempToken, response });
      expect(ok(done).status).toBe('success');
      expect(String(done.headers['set-cookie'])).toMatch(/rt_user=/);

      const [row] = await t.db.select().from(passkeys).where(eq(passkeys.userId, user.id));
      expect(row!.counter).toBe(authenticator.counter);
      expect(row!.lastUsedAt).not.toBeNull();
      const history = await t.db
        .select()
        .from(loginHistories)
        .where(
          and(eq(loginHistories.userId, user.id), eq(loginHistories.twoFactorMethod, 'passkey')),
        );
      expect(history).toHaveLength(1);
    });

    it('phát lại (replay) cùng 1 chữ ký → bị từ chối', async () => {
      const { client, email, password } = await signedInClient(t);
      const { authenticator } = await addPasskey(client);
      const { tempToken, browser, response } = await passkeyLogin(email, password, authenticator);
      ok(await browser.post('/auth/2fa/passkey/verify', { tempToken, response }));

      const again = await startLogin(new Client(t.server), email, password);
      // Không xin challenge mới: challenge cũ đã dùng
      fail(
        await new Client(t.server).post('/auth/2fa/passkey/verify', {
          tempToken: again.tempToken,
          response,
        }),
        400,
        'twoFactor.passkeyInvalid',
      );
      // Xin challenge mới nhưng gửi chữ ký cũ
      ok(
        await new Client(t.server).post('/auth/2fa/passkey/options', {
          tempToken: again.tempToken,
        }),
      );
      fail(
        await new Client(t.server).post('/auth/2fa/passkey/verify', {
          tempToken: again.tempToken,
          response,
        }),
        400,
        'twoFactor.passkeyInvalid',
      );
    });

    it('signature counter không tăng (authenticator bị nhân bản) → bị từ chối', async () => {
      const { client, email, password } = await signedInClient(t);
      const { authenticator } = await addPasskey(client);
      const first = await passkeyLogin(email, password, authenticator);
      ok(
        await first.browser.post('/auth/2fa/passkey/verify', {
          tempToken: first.tempToken,
          response: first.response,
        }),
      );

      const { tempToken } = await startLogin(new Client(t.server), email, password);
      const c = new Client(t.server);
      const options = ok(await c.post('/auth/2fa/passkey/options', { tempToken }));
      const cloned = authenticator.authenticate(options, { counter: 1 });
      fail(
        await c.post('/auth/2fa/passkey/verify', { tempToken, response: cloned }),
        400,
        'twoFactor.passkeyInvalid',
      );
    });

    it('origin lạ / chữ ký bị sửa / passkey của người khác → bị từ chối', async () => {
      const a = await signedInClient(t);
      const { authenticator } = await addPasskey(a.client);
      const b = await signedInClient(t);
      const other = await addPasskey(b.client);

      const tamper = async (
        mutate: (r: ReturnType<SoftAuthenticator['authenticate']>) => void,
        o = {},
      ) => {
        const { tempToken } = await startLogin(new Client(t.server), a.email, a.password);
        const c = new Client(t.server);
        const options = ok(await c.post('/auth/2fa/passkey/options', { tempToken }));
        const response = authenticator.authenticate(options, o);
        mutate(response);
        return c.post('/auth/2fa/passkey/verify', { tempToken, response });
      };

      fail(
        await tamper(() => undefined, { origin: 'https://evil.example' }),
        400,
        'twoFactor.passkeyInvalid',
      );
      fail(
        await tamper((r) => {
          const sig = Buffer.from(r.response.signature, 'base64url');
          sig[sig.length - 1] ^= 0xff;
          r.response.signature = sig.toString('base64url');
        }),
        400,
        'twoFactor.passkeyInvalid',
      );

      // Passkey của B ký challenge của A
      const { tempToken } = await startLogin(new Client(t.server), a.email, a.password);
      const c = new Client(t.server);
      const options = ok(await c.post('/auth/2fa/passkey/options', { tempToken }));
      fail(
        await c.post('/auth/2fa/passkey/verify', {
          tempToken,
          response: other.authenticator.authenticate(options),
        }),
        400,
      );
    });

    it('nhiều phương thức: danh sách theo ưu tiên passkey > totp, có thể đổi mặc định', async () => {
      const { client, email, password } = await signedInClient(t);
      const { secret } = await enableTotp(client);
      await reauthWithTotp(client, secret);
      await addPasskey(client);
      let pending = await startLogin(new Client(t.server), email, password);
      expect(pending.methods).toEqual(['passkey', 'totp']);
      expect(pending.defaultMethod).toBe('totp');

      fail(
        await client.put('/me/2fa/default-method', { method: 'email' }),
        400,
        'twoFactor.methodNotEnabled',
      );
      ok(await client.put('/me/2fa/default-method', { method: 'passkey' }), 204);
      pending = await startLogin(new Client(t.server), email, password);
      expect(pending.defaultMethod).toBe('passkey');
    });
  });

  describe('Quản lý passkey', () => {
    it('đổi tên không cần xác minh lại; không đổi được passkey của người khác', async () => {
      const a = await signedInClient(t);
      const { result } = await addPasskey(a.client, 'Old');
      const renamed = ok(
        await a.client.patch(`/me/2fa/passkeys/${result.passkey.id}`, { name: '  YubiKey 5  ' }),
      );
      expect(renamed.name).toBe('YubiKey 5');

      const b = await signedInClient(t);
      fail(
        await b.client.patch(`/me/2fa/passkeys/${result.passkey.id}`, { name: 'Hacked' }),
        404,
        'twoFactor.passkeyNotFound',
      );
      fail(await b.client.patch('/me/2fa/passkeys/not-a-uuid', { name: 'X' }), 422);
    });

    it('xoá cần xác minh lại (bằng chính passkey); xoá passkey cuối → tắt 2FA', async () => {
      const { client } = await signedInClient(t);
      const { authenticator, result } = await addPasskey(client);
      fail(
        await client.delete(`/me/2fa/passkeys/${result.passkey.id}`),
        403,
        'twoFactor.reauthRequired',
      );

      const prepared = ok(await client.post('/me/2fa/reauth/prepare', { method: 'passkey' }));
      expect(prepared.options.allowCredentials.map((c: { id: string }) => c.id)).toEqual([
        authenticator.id,
      ]);
      const { reauthToken } = ok(
        await client.post('/me/2fa/reauth', {
          method: 'passkey',
          response: authenticator.authenticate(prepared.options),
        }),
      );
      client.reauthToken = reauthToken;
      ok(await client.delete(`/me/2fa/passkeys/${result.passkey.id}`), 204);
      expect(ok(await client.get('/me/2fa'))).toMatchObject({
        enabled: false,
        passkeys: [],
        backupCodesRemaining: 0,
      });
    });

    it('còn passkey khác thì xoá 1 passkey không tắt 2FA; không xoá được passkey của người khác', async () => {
      const { client, user } = await signedInClient(t);
      const first = await addPasskey(client, 'One');
      const prepared = ok(await client.post('/me/2fa/reauth/prepare', { method: 'passkey' }));
      client.reauthToken = ok(
        await client.post('/me/2fa/reauth', {
          method: 'passkey',
          response: first.authenticator.authenticate(prepared.options),
        }),
      ).reauthToken;
      const second = await addPasskey(client, 'Two');
      expect(second.result.backupCodes).toBeUndefined();

      ok(await client.delete(`/me/2fa/passkeys/${first.result.passkey.id}`), 204);
      const status = ok(await client.get('/me/2fa'));
      expect(status.enabled).toBe(true);
      expect(status.passkeys.map((p: { name: string }) => p.name)).toEqual(['Two']);

      const other = await signedInClient(t);
      fail(
        await other.client.delete(`/me/2fa/passkeys/${second.result.passkey.id}`),
        404,
        'twoFactor.passkeyNotFound',
      );
      const rows = await t.db.select().from(passkeys).where(eq(passkeys.userId, user.id));
      expect(rows).toHaveLength(1);
    });
  });
});

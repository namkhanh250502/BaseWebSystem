import { expect } from 'vitest';
import { Client, ok, type TestApp } from './app';
import { createUser, totpCode, type CreateUserOptions } from './fixtures';
import { SoftAuthenticator } from './webauthn';

/** Tạo user và đăng nhập (chưa bật 2FA) */
export async function signedInClient(
  t: TestApp,
  options: CreateUserOptions = {},
  appName: 'user' | 'admin' = 'user',
) {
  const created = await createUser(t.db, options);
  const client = new Client(t.server, appName);
  ok(await client.login(created.email, created.password));
  return { ...created, client };
}

/** Lấy token xác minh lại bằng TOTP và gắn vào client */
export async function reauthWithTotp(client: Client, secret: string) {
  const data = ok(await client.post('/me/2fa/reauth', { method: 'totp', code: totpCode(secret) }));
  client.reauthToken = data.reauthToken;
  return data;
}

/** Bật TOTP cho client đang đăng nhập; trả secret và mã dự phòng (nếu là phương thức đầu tiên) */
export async function enableTotp(client: Client) {
  const setup = ok(await client.post('/me/2fa/totp/setup'));
  const result = ok(await client.post('/me/2fa/totp/enable', { code: totpCode(setup.secret) }));
  return {
    secret: setup.secret as string,
    backupCodes: result.backupCodes as string[] | undefined,
  };
}

/** Bật email 2FA (đọc mã từ mail giả) */
export async function enableEmail(t: TestApp, client: Client, email: string) {
  ok(await client.post('/me/2fa/email/send'));
  const code = t.mail.last('twoFactorCode', email)!.code!;
  return ok(await client.post('/me/2fa/email/enable', { code }));
}

/** Đăng ký passkey bằng authenticator phần mềm */
export async function addPasskey(
  client: Client,
  name = 'Laptop',
  authenticator = new SoftAuthenticator(),
) {
  const options = ok(await client.post('/me/2fa/passkeys/options'));
  const result = ok(
    await client.post('/me/2fa/passkeys', { name, response: authenticator.register(options) }),
  );
  return { authenticator, result };
}

/** Đăng nhập tới bước 2FA, trả tempToken và thông tin phương thức */
export async function startLogin(client: Client, email: string, password: string) {
  const data = ok(await client.login(email, password));
  expect(data.status).toBe('requires2fa');
  return data as {
    status: 'requires2fa';
    tempToken: string;
    methods: string[];
    defaultMethod: string;
    emailHint?: string;
  };
}

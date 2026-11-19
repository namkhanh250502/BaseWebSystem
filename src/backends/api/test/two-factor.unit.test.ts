import {
  maskEmail,
  passkeyLoginSchema,
  reauthSchema,
  twoFactorLoginSchema,
  twoFactorSetupStartSchema,
  webAuthnResponseSchema,
} from '@base/shared';
import { describe, expect, it } from 'vitest';
import { webAuthnConfig } from '../src/auth/two-factor/passkey.method';

describe('maskEmail', () => {
  it('chỉ giữ 1–2 ký tự đầu và domain', () => {
    expect(maskEmail('nguyenvana@gmail.com')).toBe('ng********@gmail.com');
    expect(maskEmail('ab@x.com')).toBe('a***@x.com');
    expect(maskEmail('a@x.com')).toBe('a***@x.com');
    expect(maskEmail('abc@x.com')).toBe('ab***@x.com');
  });
});

describe('schema 2FA', () => {
  const response = {
    id: 'abc',
    rawId: 'abc',
    type: 'public-key',
    response: { clientDataJSON: 'x' },
  };

  it('phản hồi WebAuthn: bắt buộc id/rawId/type public-key/response', () => {
    expect(webAuthnResponseSchema.safeParse(response).success).toBe(true);
    expect(webAuthnResponseSchema.parse(response).clientExtensionResults).toEqual({});
    expect(webAuthnResponseSchema.safeParse({ ...response, type: 'password' }).success).toBe(false);
    expect(webAuthnResponseSchema.safeParse({ ...response, id: '' }).success).toBe(false);
    expect(webAuthnResponseSchema.safeParse({ ...response, id: 'a'.repeat(2000) }).success).toBe(
      false,
    );
    expect(passkeyLoginSchema.safeParse({ response }).success).toBe(false);
  });

  it('đăng nhập: method chỉ nhận totp/email/backup (passkey có endpoint riêng)', () => {
    expect(twoFactorLoginSchema.safeParse({ tempToken: 't', code: '123456' }).success).toBe(true);
    expect(
      twoFactorLoginSchema.safeParse({ tempToken: 't', method: 'passkey', code: '123456' }).success,
    ).toBe(false);
    expect(twoFactorLoginSchema.safeParse({ tempToken: 't', code: '123' }).success).toBe(false);
  });

  it('thiết lập: mặc định TOTP; xác minh lại: method hợp lệ', () => {
    expect(twoFactorSetupStartSchema.parse({ tempToken: 't' }).method).toBe('totp');
    expect(twoFactorSetupStartSchema.safeParse({ tempToken: 't', method: 'sms' }).success).toBe(
      false,
    );
    expect(reauthSchema.safeParse({ method: 'backup', code: 'ABCD-EFGH' }).success).toBe(true);
    expect(reauthSchema.safeParse({ method: 'password' }).success).toBe(false);
  });
});

describe('webAuthnConfig', () => {
  it('RP ID theo env, origin gồm cả app user và admin', () => {
    expect(webAuthnConfig()).toEqual({
      rpID: 'localhost',
      rpName: 'Base Web Test',
      origins: ['http://localhost:5173', 'http://localhost:5174'],
    });
  });
});

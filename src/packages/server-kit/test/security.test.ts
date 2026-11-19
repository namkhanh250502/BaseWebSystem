import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AppError,
  buildOtpauthUrl,
  configureTrustedProxies,
  createRateLimiter,
  DEFAULT_TRUSTED_PROXIES,
  decrypt,
  encrypt,
  generateBackupCodes,
  generatePassword,
  generateTotpSecret,
  getClientIp,
  normalizeBackupCode,
  normalizeIp,
  parseTrustedProxies,
  randomToken,
  readBearerToken,
  readCookie,
  serializeCookie,
  sha256,
  signJwt,
  verifyJwt,
  verifyTotp,
  type RequestLike,
} from '../src';
import { hashPassword, verifyPassword } from '../src/password';

const SECRET = 'unit-test-secret-unit-test-secret-1234';

function req(headers: Record<string, string>): RequestLike {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: { get: (n) => lower[n.toLowerCase()] ?? null, has: (n) => n.toLowerCase() in lower },
  };
}

/** TOTP chuẩn RFC 6238 để đối chiếu với otplib */
function rfcTotp(secret: string, atMs: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const c of secret.replace(/=+$/, '')) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const h = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

describe('crypto: AES-256-GCM cho secret 2FA', () => {
  it('mã hoá rồi giải mã ra đúng; mỗi lần mã hoá ra kết quả khác (IV ngẫu nhiên)', () => {
    const a = encrypt('JBSWY3DPEHPK3PXP', SECRET);
    const b = encrypt('JBSWY3DPEHPK3PXP', SECRET);
    expect(a).not.toBe(b);
    expect(a.split(':')).toHaveLength(3);
    expect(decrypt(a, SECRET)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('sai key hoặc dữ liệu bị sửa → ném lỗi (GCM xác thực toàn vẹn)', () => {
    const payload = encrypt('secret', SECRET);
    expect(() => decrypt(payload, 'another-key-another-key-another-key')).toThrow();
    const [iv, tag, data] = payload.split(':');
    const flipped = (data!.startsWith('0') ? '1' : '0') + data!.slice(1);
    expect(() => decrypt([iv, tag, flipped].join(':'), SECRET)).toThrow();
    expect(() => decrypt('not-valid', SECRET)).toThrow();
  });

  it('sha256 / randomToken', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(randomToken()).toMatch(/^[0-9a-f]{64}$/);
    expect(randomToken(16)).toHaveLength(32);
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe('mã dự phòng & mật khẩu ngẫu nhiên', () => {
  it('mã dự phòng dạng XXXX-XXXX, không có ký tự dễ nhầm (0 O 1 I)', () => {
    const codes = generateBackupCodes(50);
    expect(new Set(codes).size).toBe(50);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(c).not.toMatch(/[01OI]/);
    }
  });

  it('chuẩn hoá mã người dùng nhập', () => {
    expect(normalizeBackupCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(normalizeBackupCode('ab cd ef gh')).toBe('ABCDEFGH');
  });

  it('mật khẩu ngẫu nhiên luôn có chữ thường, chữ hoa, chữ số', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword(12);
      expect(p).toHaveLength(12);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
    }
  });
});

describe('password: scrypt', () => {
  it('hash có salt ngẫu nhiên, verify đúng/sai', async () => {
    const a = await hashPassword('Password123');
    const b = await hashPassword('Password123');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('Password123', a)).toBe(true);
    expect(await verifyPassword('password123', a)).toBe(false);
    expect(await verifyPassword('', a)).toBe(false);
  });

  it('hash hỏng / thuật toán lạ → false (không ném lỗi)', async () => {
    expect(await verifyPassword('x', 'md5$abc$def')).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$$')).toBe(false);
  });
});

describe('JWT', () => {
  it('ký và xác minh đúng audience', async () => {
    const token = await signJwt({
      subject: 'u1',
      audience: 'access',
      secret: SECRET,
      expiresIn: '5m',
      claims: { app: 'user' },
    });
    expect(await verifyJwt(token, SECRET, 'access')).toMatchObject({
      subject: 'u1',
      claims: { app: 'user' },
    });
  });

  it('khác audience / sai secret / hết hạn / bị sửa → null', async () => {
    const token = await signJwt({
      subject: 'u1',
      audience: 'access',
      secret: SECRET,
      expiresIn: '5m',
    });
    expect(await verifyJwt(token, SECRET, '2fa-pending')).toBeNull();
    expect(await verifyJwt(token, 'wrong-secret-wrong-secret-wrong-secret', 'access')).toBeNull();
    const expired = await signJwt({
      subject: 'u1',
      audience: 'access',
      secret: SECRET,
      expiresIn: Math.floor(Date.now() / 1000) - 10,
    });
    expect(await verifyJwt(expired, SECRET, 'access')).toBeNull();
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString());
    payload.sub = 'admin';
    const tampered = [h, Buffer.from(JSON.stringify(payload)).toString('base64url'), s].join('.');
    expect(await verifyJwt(tampered, SECRET, 'access')).toBeNull();
  });

  it('từ chối thuật toán "none"', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sub: 'u1', aud: 'access', exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString('base64url');
    expect(await verifyJwt(`${header}.${body}.`, SECRET, 'access')).toBeNull();
  });

  it('expiresIn dạng chuỗi giây là tương đối (bẫy: số nguyên là thời điểm tuyệt đối)', async () => {
    const token = await signJwt({
      subject: 'u1',
      audience: 'a',
      secret: SECRET,
      expiresIn: '300s',
    });
    expect(await verifyJwt(token, SECRET, 'a')).not.toBeNull();
    const absolute = await signJwt({
      subject: 'u1',
      audience: 'a',
      secret: SECRET,
      expiresIn: 300,
    });
    expect(await verifyJwt(absolute, SECRET, 'a')).toBeNull();
  });

  it('đọc Bearer token', () => {
    expect(readBearerToken(req({ authorization: 'Bearer abc' }))).toBe('abc');
    expect(readBearerToken(req({ authorization: 'Basic abc' }))).toBeNull();
    expect(readBearerToken(req({}))).toBeNull();
  });
});

describe('TOTP', () => {
  it('secret Base32, URL otpauth có issuer và label', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
    const url = buildOtpauthUrl({ issuer: 'Base Web', label: 'a@b.com', secret });
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain(`secret=${secret}`);
    expect(url).toContain('issuer=Base');
  });

  it('khớp mã RFC 6238 hiện tại và ±1 bước, từ chối mã xa hơn / sai định dạng', async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(await verifyTotp(secret, rfcTotp(secret, now))).toBe(true);
    expect(await verifyTotp(secret, rfcTotp(secret, now - 30_000))).toBe(true);
    expect(await verifyTotp(secret, rfcTotp(secret, now + 30_000))).toBe(true);
    const far = rfcTotp(secret, now - 5 * 30_000);
    const near = new Set([-1, 0, 1].map((o) => rfcTotp(secret, now + o * 30_000)));
    if (!near.has(far)) expect(await verifyTotp(secret, far)).toBe(false);
    expect(await verifyTotp(secret, '12345')).toBe(false);
    expect(await verifyTotp(secret, 'abcdef')).toBe(false);
    expect(await verifyTotp('', '123456')).toBe(false);
  });
});

describe('rate limit (fixed window)', () => {
  it('cho phép đúng `limit` lần rồi ném 429 kèm số giây chờ', async () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 3; i++) await limiter.hit('k', 3, 60_000);
    const error = await limiter.hit('k', 3, 60_000).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(429);
    // Key khác không bị ảnh hưởng; reset xoá bộ đếm
    await limiter.hit('other', 3, 60_000);
    await limiter.reset('k');
    await limiter.hit('k', 3, 60_000);
  });

  it('hết cửa sổ thời gian thì đếm lại', async () => {
    const limiter = createRateLimiter();
    await limiter.hit('w', 1, 20);
    await expect(limiter.hit('w', 1, 20)).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 30));
    await expect(limiter.hit('w', 1, 20)).resolves.toBeUndefined();
  });
});

describe('request: IP, cookie', () => {
  it('ưu tiên CF-Connecting-IP, rồi X-Forwarded-For, rồi X-Real-IP', () => {
    expect(getClientIp(req({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe(
      '1.1.1.1',
    );
    expect(getClientIp(req({ 'x-forwarded-for': '2.2.2.2' }))).toBe('2.2.2.2');
    expect(getClientIp(req({ 'x-real-ip': '4.4.4.4' }))).toBe('4.4.4.4');
    expect(getClientIp(req({}))).toBeNull();
  });

  it('X-Forwarded-For đọc từ phải sang, bỏ qua proxy tin cậy (phần tử trái giả mạo được)', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '6.6.6.6, 2.2.2.2' }))).toBe('2.2.2.2');
    expect(getClientIp(req({ 'x-forwarded-for': '6.6.6.6, 2.2.2.2, 127.0.0.1' }))).toBe('2.2.2.2');
    // Toàn proxy tin cậy (dev gọi từ localhost qua proxy Vite) → lấy phần tử đầu
    expect(getClientIp(req({ 'x-forwarded-for': '::1, 127.0.0.1' }))).toBe('::1');
  });

  it('chỉ tin header IP khi kết nối đến từ proxy tin cậy', () => {
    const spoofed = { 'cf-connecting-ip': '6.6.6.6', 'x-forwarded-for': '6.6.6.6' };
    // Gọi thẳng API (không qua proxy): bỏ qua header, dùng IP kết nối
    expect(getClientIp({ ...req(spoofed), remoteAddress: '203.0.113.9' })).toBe('203.0.113.9');
    expect(getClientIp({ ...req(spoofed), remoteAddress: '::ffff:203.0.113.9' })).toBe(
      '203.0.113.9',
    );
    expect(getClientIp({ ...req(spoofed), remoteAddress: null })).toBeNull();
    // Qua proxy loopback: tin header
    expect(getClientIp({ ...req(spoofed), remoteAddress: '::ffff:127.0.0.1' })).toBe('6.6.6.6');
    // Qua proxy nhưng không có header → IP kết nối
    expect(getClientIp({ ...req({}), remoteAddress: '127.0.0.1' })).toBe('127.0.0.1');
  });

  it('cấu hình proxy tin cậy theo IP / CIDR', () => {
    try {
      configureTrustedProxies(['10.0.0.0/8', 'fd00::/8']);
      const headers = req({ 'x-forwarded-for': '6.6.6.6, 2.2.2.2, 10.1.1.1' });
      expect(getClientIp({ ...headers, remoteAddress: '10.9.9.9' })).toBe('2.2.2.2');
      expect(getClientIp({ ...headers, remoteAddress: 'fd00::1' })).toBe('2.2.2.2');
      // Loopback không còn trong danh sách → không tin header
      expect(getClientIp({ ...headers, remoteAddress: '127.0.0.1' })).toBe('127.0.0.1');
    } finally {
      configureTrustedProxies(DEFAULT_TRUSTED_PROXIES);
    }
    expect(() => parseTrustedProxies(['not-an-ip'])).toThrow();
    expect(() => parseTrustedProxies(['10.0.0.0/33'])).toThrow();
    expect(() => parseTrustedProxies(['10.0.0.0/abc'])).toThrow();
  });

  it('chuẩn hoá IP', () => {
    expect(normalizeIp('1.2.3.4:5678')).toBe('1.2.3.4');
    expect(normalizeIp('[::1]:80')).toBe('::1');
    expect(normalizeIp('::ffff:10.0.0.1')).toBe('10.0.0.1');
    expect(normalizeIp('')).toBeNull();
  });

  it('cookie phiên luôn HttpOnly + SameSite, Secure khi bật', () => {
    const cookie = serializeCookie('rt_user', 'a b', {
      maxAgeSeconds: 60,
      path: '/api/v1',
      secure: true,
    });
    expect(cookie).toBe('rt_user=a%20b; Path=/api/v1; Max-Age=60; HttpOnly; SameSite=Lax; Secure');
    expect(serializeCookie('x', 'y', { maxAgeSeconds: 0 })).not.toContain('Secure');
    expect(readCookie(req({ cookie: 'a=1; rt_user=a%20b; c=3' }), 'rt_user')).toBe('a b');
    expect(readCookie(req({ cookie: 'a=1' }), 'rt_user')).toBeNull();
  });
});

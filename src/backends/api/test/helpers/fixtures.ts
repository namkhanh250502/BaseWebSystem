import { createHmac, randomUUID } from 'node:crypto';
import { eq, roles, users, type User } from '@base/db';
import { SYSTEM_ROLES } from '@base/shared';
import { hashPassword } from '@base/server-kit';
import type { Database } from '../../src/core/database';

export const DEFAULT_PASSWORD = 'Password123';

export interface CreateUserOptions {
  email?: string;
  password?: string | null;
  verified?: boolean;
  /** Gán role Administrator (có quyền admin.access) */
  admin?: boolean;
  /** Gán role theo tên (ưu tiên hơn `admin`) */
  role?: (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];
  superAdmin?: boolean;
  isActive?: boolean;
  lang?: 'vi' | 'en';
}

/** Email duy nhất cho mỗi test */
export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.com`;
}

/** Tạo user trực tiếp trong DB */
export async function createUser(db: Database, options: CreateUserOptions = {}) {
  const email = (options.email ?? uniqueEmail()).toLowerCase();
  const password = options.password === undefined ? DEFAULT_PASSWORD : options.password;
  const roleName =
    options.role ?? (options.admin ? SYSTEM_ROLES.ADMINISTRATOR : SYSTEM_ROLES.USER);
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, roleName));
  const [user] = await db
    .insert(users)
    .values({
      email,
      firstName: 'Test',
      lastName: 'User',
      passwordHash: password ? await hashPassword(password) : null,
      emailVerifiedAt: options.verified === false ? null : new Date(),
      roleId: role?.id ?? null,
      isSuperAdmin: options.superAdmin ?? false,
      isActive: options.isActive ?? true,
      lang: options.lang ?? 'vi',
    })
    .returning();
  return { user: user!, email, password: password ?? '' };
}

export async function reloadUser(db: Database, id: string): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user!;
}

// ----- TOTP (RFC 6238, SHA-1, 6 số, bước 30 giây) — tự cài để test không phụ thuộc otplib -----

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx < 0) throw new Error(`Ký tự base32 không hợp lệ: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Mã TOTP hiện tại (offsetSteps = lệch bao nhiêu bước 30 giây) */
export function totpCode(secret: string, offsetSteps = 0): string {
  const counter = Math.floor(Date.now() / 1000 / 30) + offsetSteps;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

/** Mã 6 số chắc chắn sai (khác mã hiện tại và 2 bước lân cận) */
export function wrongTotpCode(secret: string): string {
  const valid = new Set([-1, 0, 1].map((o) => totpCode(secret, o)));
  for (let i = 0; ; i++) {
    const candidate = String(i).padStart(6, '0');
    if (!valid.has(candidate)) return candidate;
  }
}

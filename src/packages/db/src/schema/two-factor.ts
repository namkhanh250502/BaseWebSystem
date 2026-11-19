import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/** Passkey (WebAuthn credential) dùng làm phương thức 2FA. Mỗi user tối đa vài thiết bị. */
export const passkeys = pgTable(
  'passkeys',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Credential ID (base64url) do authenticator cấp */
    credentialId: varchar({ length: 512 }).notNull().unique(),
    /** COSE public key, base64url */
    publicKey: text().notNull(),
    /** Signature counter: giảm/không tăng bất thường = nghi authenticator bị nhân bản */
    counter: bigint({ mode: 'number' }).notNull().default(0),
    /** Cách trình duyệt kết nối tới authenticator: internal, hybrid, usb, nfc, ble */
    transports: text().array(),
    /** 'singleDevice' | 'multiDevice' */
    deviceType: varchar({ length: 20 }),
    /** Passkey được đồng bộ (iCloud Keychain, Google Password Manager…) */
    backedUp: boolean().notNull().default(false),
    /** Nhận diện loại authenticator */
    aaguid: varchar({ length: 36 }),
    /** Tên người dùng đặt: "MacBook", "YubiKey 5"… */
    name: varchar({ length: 100 }).notNull(),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);

/**
 * Thử thách xác thực dùng 1 lần: mã 2FA gửi qua email và challenge WebAuthn.
 * Lưu DB (không lưu bộ nhớ) để chạy được nhiều instance API.
 */
export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'email_otp' | 'webauthn_register' | 'webauthn_authenticate' */
    type: varchar({ length: 30 }).notNull(),
    /** 'login' | 'enable' | 'reauth' */
    purpose: varchar({ length: 20 }).notNull(),
    /** email_otp: SHA-256 của mã; webauthn: challenge base64url */
    value: varchar({ length: 255 }).notNull(),
    /** Số lần nhập sai */
    attempts: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.type, t.purpose), index().on(t.expiresAt)],
);

export type Passkey = typeof passkeys.$inferSelect;
export type AuthChallenge = typeof authChallenges.$inferSelect;

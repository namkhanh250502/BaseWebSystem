import { char, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

/** Mỗi dòng là 1 phiên đăng nhập. Chỉ lưu SHA-256 của refresh token. */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char({ length: 64 }).notNull().unique(),
    /** App đã tạo phiên: 'admin' | 'user' */
    app: varchar({ length: 20 }).notNull(),
    /** Hash của token kế tiếp sau khi xoay vòng */
    replacedByHash: char({ length: 64 }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    ipAddress: varchar({ length: 45 }),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId), index().on(t.expiresAt)],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char({ length: 64 }).notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);

/** Mã dự phòng 2FA, mỗi mã dùng được 1 lần. Chỉ lưu SHA-256. */
export const twoFactorBackupCodes = pgTable(
  'two_factor_backup_codes',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: char({ length: 64 }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);

export type RefreshToken = typeof refreshTokens.$inferSelect;

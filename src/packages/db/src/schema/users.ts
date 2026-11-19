import {
  boolean,
  char,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { roles } from './roles';

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: varchar({ length: 255 }).notNull().unique(),
    firstName: varchar({ length: 100 }).notNull().default(''),
    lastName: varchar({ length: 100 }).notNull().default(''),
    /** null: tài khoản tạo qua Google, chưa đặt mật khẩu */
    passwordHash: text(),
    /** ID tài khoản Google đã liên kết (claim `sub`) */
    googleId: varchar({ length: 64 }).unique(),
    emailVerifiedAt: timestamp({ withTimezone: true }),
    /** SHA-256 của mã xác minh email 6 số đang chờ */
    emailVerificationCodeHash: char({ length: 64 }),
    emailVerificationExpiresAt: timestamp({ withTimezone: true }),
    emailVerificationSentAt: timestamp({ withTimezone: true }),
    avatarUrl: varchar({ length: 500 }),
    lang: varchar({ length: 10 }).notNull().default('vi'),
    roleId: uuid().references(() => roles.id, { onDelete: 'set null' }),
    /** Bỏ qua mọi kiểm tra quyền */
    isSuperAdmin: boolean().notNull().default(false),
    /** false = tài khoản bị khóa */
    isActive: boolean().notNull().default(true),
    /** true khi có ít nhất 1 phương thức 2FA đang bật (tính lại sau mỗi lần thêm/xoá phương thức) */
    twoFactorEnabled: boolean().notNull().default(false),
    /** Secret TOTP đã mã hóa AES-256-GCM (iv:tag:data); có thể tồn tại khi đang thiết lập dở */
    twoFactorSecret: text(),
    /** TOTP (ứng dụng Authenticator) đã được xác nhận và đang bật */
    twoFactorTotpEnabled: boolean().notNull().default(false),
    /**
     * Bước thời gian TOTP (RFC 6238, 30 giây/bước) của mã đúng gần nhất. Mã thuộc bước <= giá trị
     * này bị từ chối → mỗi mã chỉ dùng được 1 lần.
     */
    twoFactorTotpLastStep: integer(),
    /** Nhận mã 2FA qua email */
    twoFactorEmailEnabled: boolean().notNull().default(false),
    /** Phương thức hiển thị đầu tiên khi đăng nhập: 'totp' | 'email' | 'passkey' */
    twoFactorDefaultMethod: varchar({ length: 20 }),
    lastLoginAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.roleId), index().on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

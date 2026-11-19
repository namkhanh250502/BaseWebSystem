import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Lịch sử đăng nhập thành công (mỗi lần tạo phiên mới: mật khẩu, 2FA, Google, đăng ký).
 * Thiết bị được phân tích từ userAgent lúc đọc; vị trí lấy từ header CDN hoặc tra cứu IP
 * (có thể được điền sau vài giây nếu tra cứu chạy nền).
 */
export const loginHistories = pgTable(
  'login_histories',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** App đăng nhập: 'admin' | 'user' */
    app: varchar({ length: 20 }).notNull(),
    ipAddress: varchar({ length: 45 }),
    userAgent: text(),
    /** Mã quốc gia ISO 3166-1 alpha-2 */
    countryCode: varchar({ length: 2 }),
    country: varchar({ length: 100 }),
    region: varchar({ length: 100 }),
    city: varchar({ length: 100 }),
    /** Phương thức 2FA đã dùng: 'totp' | 'email' | 'passkey' | 'backup' (null = không qua 2FA) */
    twoFactorMethod: varchar({ length: 20 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.createdAt)],
);

export type LoginHistory = typeof loginHistories.$inferSelect;

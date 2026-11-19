import { NOTIFICATION_TYPES } from '@base/shared';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);

/** Thông báo cho 1 user (userId) hoặc toàn hệ thống (isGlobal = true, userId = null) */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    isGlobal: boolean().notNull().default(false),
    type: notificationTypeEnum().notNull().default('info'),
    title: varchar({ length: 255 }).notNull(),
    message: text().notNull().default(''),
    link: varchar({ length: 500 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.isGlobal, t.createdAt)],
);

/** Trạng thái đã đọc theo từng user (áp dụng cho cả thông báo cá nhân lẫn global) */
export const notificationReads = pgTable(
  'notification_reads',
  {
    notificationId: uuid()
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);

export type NewNotification = typeof notifications.$inferInsert;

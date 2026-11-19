import { pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';

/** Cài đặt hệ thống dạng key/value. Các key đã biết được mô tả ở @base/shared SETTING_DEFINITIONS. */
export const settings = pgTable('settings', {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull().unique(),
  value: text(),
  ...timestamps,
});

export type Setting = typeof settings.$inferSelect;

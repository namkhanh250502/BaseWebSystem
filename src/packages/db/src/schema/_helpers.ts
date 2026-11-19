import { timestamp } from 'drizzle-orm/pg-core';

/** Cột created_at / updated_at dùng chung cho mọi bảng */
export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

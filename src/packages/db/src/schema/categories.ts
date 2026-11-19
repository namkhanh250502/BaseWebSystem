import { sql } from 'drizzle-orm';
import { pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { recordStatusEnum } from './commerce-enums';

/** Danh mục sản phẩm (một cấp). Không xoá khi còn sản phẩm. */
export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar({ length: 150 }).notNull(),
    description: text(),
    status: recordStatusEnum().notNull().default('ACTIVE'),
    ...timestamps,
  },
  (t) => [uniqueIndex('categories_name_lower_unique').on(sql`lower(${t.name})`)],
);

export type Category = typeof categories.$inferSelect;

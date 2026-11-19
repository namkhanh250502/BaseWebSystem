import { sql } from 'drizzle-orm';
import { index, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { recordStatusEnum } from './commerce-enums';

/** Nhà cung cấp. Không xoá khi đã có phiếu nhập (chỉ ngừng hợp tác). */
export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar({ length: 255 }).notNull(),
    contactPerson: varchar({ length: 150 }),
    phone: varchar({ length: 30 }),
    email: varchar({ length: 255 }),
    address: text(),
    notes: text(),
    status: recordStatusEnum().notNull().default('ACTIVE'),
    ...timestamps,
  },
  (t) => [
    index('suppliers_name_lower_idx').on(sql`lower(${t.name})`),
    index().on(t.phone),
    index('suppliers_email_lower_idx').on(sql`lower(${t.email})`),
  ],
);

export type Supplier = typeof suppliers.$inferSelect;

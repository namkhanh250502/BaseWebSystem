import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { cost, documentStatusEnum, money, quantity } from './commerce-enums';
import { products } from './products';
import { suppliers } from './suppliers';
import { users } from './users';

/** Phiếu nhập hàng. Xác nhận → cộng tồn (một lần); phiếu đã xác nhận là bất biến (spec Q1). */
export const purchaseReceipts = pgTable(
  'purchase_receipts',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** PN-YYYYMMDD-NNNN */
    code: varchar({ length: 32 }).notNull().unique(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    receiptDate: date({ mode: 'string' }).notNull(),
    status: documentStatusEnum().notNull().default('DRAFT'),
    /** Σ thành tiền dòng (đã trừ chiết khấu dòng) */
    subtotal: money().notNull().default('0'),
    /** Chiết khấu cả phiếu */
    discountAmount: money().notNull().default('0'),
    totalAmount: money().notNull().default('0'),
    notes: text(),
    cancelReason: text(),
    /** Khoá lạc quan khi sửa / xác nhận */
    version: integer().notNull().default(1),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    confirmedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    cancelledBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    confirmedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.supplierId, t.receiptDate),
    index().on(t.status, t.confirmedAt),
    check(
      'purchase_receipts_amounts_check',
      sql`${t.discountAmount} >= 0 and ${t.discountAmount} <= ${t.subtotal} and ${t.totalAmount} >= 0`,
    ),
    check(
      'purchase_receipts_confirmed_check',
      sql`${t.status} <> 'CONFIRMED' or ${t.confirmedAt} is not null`,
    ),
  ],
);

export const purchaseReceiptItems = pgTable(
  'purchase_receipt_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    receiptId: uuid()
      .notNull()
      .references(() => purchaseReceipts.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    lineNo: integer().notNull(),
    quantity: quantity().notNull(),
    unitPrice: money().notNull(),
    discountAmount: money().notNull().default('0'),
    /** quantity × unitPrice − discountAmount */
    lineAmount: money().notNull(),
    /** Giá vốn đơn vị sau phân bổ chiết khấu phiếu, ghi khi xác nhận */
    unitCost: cost(),
  },
  (t) => [
    index().on(t.receiptId),
    index().on(t.productId),
    check('purchase_receipt_items_quantity_check', sql`${t.quantity} > 0`),
    check(
      'purchase_receipt_items_amounts_check',
      sql`${t.unitPrice} >= 0 and ${t.discountAmount} >= 0 and ${t.lineAmount} >= 0`,
    ),
  ],
);

export type PurchaseReceipt = typeof purchaseReceipts.$inferSelect;
export type PurchaseReceiptItem = typeof purchaseReceiptItems.$inferSelect;

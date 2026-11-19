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
import {
  cost,
  documentStatusEnum,
  money,
  paymentMethodEnum,
  paymentStatusEnum,
  quantity,
} from './commerce-enums';
import { products } from './products';
import { users } from './users';

/** Đơn bán. Chốt → trừ tồn (một lần); huỷ đơn đã chốt → cộng lại tồn theo giá vốn đã lưu. */
export const salesOrders = pgTable(
  'sales_orders',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** DH-YYYYMMDD-NNNN */
    code: varchar({ length: 32 }).notNull().unique(),
    /** Idempotency: client gửi lại cùng id → trả về đơn đã tạo */
    clientRequestId: uuid().unique(),
    orderDate: date({ mode: 'string' }).notNull(),
    customerName: varchar({ length: 150 }),
    customerPhone: varchar({ length: 30 }),
    status: documentStatusEnum().notNull().default('DRAFT'),
    paymentMethod: paymentMethodEnum().notNull().default('CASH'),
    paymentStatus: paymentStatusEnum().notNull().default('UNPAID'),
    paidAt: timestamp({ withTimezone: true }),
    subtotal: money().notNull().default('0'),
    discountAmount: money().notNull().default('0'),
    totalAmount: money().notNull().default('0'),
    /** Σ giá vốn các dòng, ghi khi chốt */
    totalCost: money(),
    notes: text(),
    cancelReason: text(),
    version: integer().notNull().default(1),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    confirmedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    cancelledBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    paidBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    confirmedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.status, t.confirmedAt),
    index().on(t.createdBy, t.createdAt),
    index().on(t.paymentStatus),
    index().on(t.customerPhone),
    check(
      'sales_orders_amounts_check',
      sql`${t.discountAmount} >= 0 and ${t.discountAmount} <= ${t.subtotal} and ${t.totalAmount} >= 0`,
    ),
    check('sales_orders_paid_check', sql`${t.paymentStatus} = 'UNPAID' or ${t.paidAt} is not null`),
    check(
      'sales_orders_confirmed_check',
      sql`${t.status} <> 'CONFIRMED' or ${t.confirmedAt} is not null`,
    ),
  ],
);

export const salesOrderItems = pgTable(
  'sales_order_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    lineNo: integer().notNull(),
    /** Snapshot tại thời điểm bán: sửa sản phẩm không làm đổi đơn cũ */
    skuSnapshot: varchar({ length: 64 }).notNull(),
    nameSnapshot: varchar({ length: 255 }).notNull(),
    unitSnapshot: varchar({ length: 30 }).notNull(),
    quantity: quantity().notNull(),
    /** Giá niêm yết lúc thêm dòng */
    listPrice: money().notNull(),
    /** Giá bán thực tế */
    unitPrice: money().notNull(),
    discountAmount: money().notNull().default('0'),
    /** quantity × unitPrice − discountAmount */
    lineAmount: money().notNull(),
    /** Phần chiết khấu đơn phân bổ vào dòng, ghi khi chốt */
    allocatedOrderDiscount: money(),
    /** Doanh thu thuần của dòng = lineAmount − allocatedOrderDiscount */
    netAmount: money(),
    /** Giá vốn bình quân tại thời điểm chốt */
    unitCost: cost(),
    costAmount: money(),
  },
  (t) => [
    index().on(t.orderId),
    index().on(t.productId),
    check('sales_order_items_quantity_check', sql`${t.quantity} > 0`),
    check(
      'sales_order_items_amounts_check',
      sql`${t.unitPrice} >= 0 and ${t.discountAmount} >= 0 and ${t.lineAmount} >= 0`,
    ),
  ],
);

export type SalesOrder = typeof salesOrders.$inferSelect;
export type SalesOrderItem = typeof salesOrderItems.$inferSelect;

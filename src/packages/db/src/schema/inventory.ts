import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  adjustmentReasonEnum,
  cost,
  movementRefTypeEnum,
  movementTypeEnum,
  quantity,
} from './commerce-enums';
import { products } from './products';
import { users } from './users';

/**
 * Tồn hiện tại + giá vốn bình quân của từng sản phẩm (một kho). Chỉ InventoryService được ghi,
 * luôn kèm một dòng inventory_movements. CHECK quantity ≥ 0 là chốt chặn cuối chống tồn âm.
 */
export const inventoryBalances = pgTable(
  'inventory_balances',
  {
    productId: uuid()
      .primaryKey()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: quantity().notNull().default('0'),
    avgCost: cost().notNull().default('0'),
    lastMovementAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('inventory_balances_quantity_check', sql`${t.quantity} >= 0`),
    check('inventory_balances_avg_cost_check', sql`${t.avgCost} >= 0`),
  ],
);

/** Sổ cái biến động tồn kho — chỉ thêm, không sửa / xoá. Σ quantityChange = tồn hiện tại. */
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    type: movementTypeEnum().notNull(),
    /** Dương = vào kho, âm = ra kho */
    quantityChange: quantity().notNull(),
    quantityBefore: quantity().notNull(),
    quantityAfter: quantity().notNull(),
    /** Giá vốn đơn vị áp cho biến động này */
    unitCost: cost().notNull(),
    avgCostAfter: cost().notNull(),
    refType: movementRefTypeEnum().notNull(),
    refId: uuid().notNull(),
    refCode: varchar({ length: 32 }).notNull(),
    refItemId: uuid(),
    reason: adjustmentReasonEnum(),
    note: text(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.productId, t.createdAt),
    index().on(t.refType, t.refId),
    index().on(t.type, t.createdAt),
    index().on(t.createdAt),
    check('inventory_movements_change_check', sql`${t.quantityChange} <> 0`),
    check(
      'inventory_movements_after_check',
      sql`${t.quantityAfter} = ${t.quantityBefore} + ${t.quantityChange} and ${t.quantityAfter} >= 0`,
    ),
  ],
);

/** Phiếu điều chỉnh tồn (áp dụng ngay, không có nháp) */
export const inventoryAdjustments = pgTable(
  'inventory_adjustments',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** DC-YYYYMMDD-NNNN */
    code: varchar({ length: 32 }).notNull().unique(),
    clientRequestId: uuid().unique(),
    reason: adjustmentReasonEnum().notNull(),
    note: text(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.createdAt),
    check('inventory_adjustments_note_check', sql`${t.reason} <> 'OTHER' or ${t.note} is not null`),
  ],
);

export const inventoryAdjustmentItems = pgTable(
  'inventory_adjustment_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    adjustmentId: uuid()
      .notNull()
      .references(() => inventoryAdjustments.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantityBefore: quantity().notNull(),
    quantityChange: quantity().notNull(),
    quantityAfter: quantity().notNull(),
    /** Số đếm thực tế (chỉ với lý do STOCKTAKE) */
    countedQuantity: quantity(),
    unitCost: cost().notNull(),
  },
  (t) => [
    index().on(t.adjustmentId),
    index().on(t.productId),
    check(
      'inventory_adjustment_items_change_check',
      sql`${t.quantityChange} <> 0 and ${t.quantityAfter} >= 0`,
    ),
  ],
);

/** Bộ đếm mã chứng từ theo tiền tố + ngày (giờ VN): PN-20261119-0001 */
export const documentSequences = pgTable(
  'document_sequences',
  {
    prefix: varchar({ length: 8 }).notNull(),
    seqDate: date({ mode: 'string' }).notNull(),
    lastValue: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.prefix, t.seqDate] })],
);

export type InventoryBalance = typeof inventoryBalances.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovements.$inferInsert;
export type InventoryAdjustment = typeof inventoryAdjustments.$inferSelect;

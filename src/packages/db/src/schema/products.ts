import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { categories } from './categories';
import { imageStatusEnum, money, productStatusEnum, quantity } from './commerce-enums';
import { users } from './users';

/** Sản phẩm. Tồn kho hiện tại nằm ở `inventory_balances`, không sửa trực tiếp ở đây (FR-005). */
export const products = pgTable(
  'products',
  {
    id: uuid().primaryKey().defaultRandom(),
    sku: varchar({ length: 64 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    description: text(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    unit: varchar({ length: 30 }).notNull(),
    /** false: số lượng phải là số nguyên (hàng đếm theo cái) */
    allowDecimalQuantity: boolean().notNull().default(false),
    /** Giá nhập tham khảo (điền sẵn phiếu nhập); giá vốn thực là bình quân ở inventory_balances */
    purchasePrice: money().notNull().default('0'),
    sellingPrice: money().notNull(),
    minStock: quantity().notNull().default('0'),
    status: productStatusEnum().notNull().default('ACTIVE'),
    /** Đã phát sinh chứng từ → không cho xoá cứng */
    hasTransactions: boolean().notNull().default(false),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('products_sku_lower_unique').on(sql`lower(${t.sku})`),
    index('products_name_lower_idx').on(sql`lower(${t.name})`),
    index().on(t.categoryId),
    index().on(t.status),
    check('products_purchase_price_check', sql`${t.purchasePrice} >= 0`),
    check('products_selling_price_check', sql`${t.sellingPrice} >= 0`),
    check('products_min_stock_check', sql`${t.minStock} >= 0`),
  ],
);

/**
 * Ảnh sản phẩm trên MinIO (bucket private). PENDING → READY khi tải lên hoàn tất và hợp lệ;
 * DELETED chờ xoá object rồi xoá bản ghi (dọn bởi StorageCleanupService).
 */
export const productImages = pgTable(
  'product_images',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** products/<productId>/<uuid>.<ext> */
    objectKey: varchar({ length: 255 }).notNull().unique(),
    mimeType: varchar({ length: 50 }).notNull(),
    sizeBytes: integer().notNull(),
    originalName: varchar({ length: 255 }),
    sortOrder: integer().notNull().default(0),
    isPrimary: boolean().notNull().default(false),
    status: imageStatusEnum().notNull().default('PENDING'),
    /** Hạn hoàn tất tải lên (PENDING quá hạn bị dọn) */
    uploadExpiresAt: timestamp({ withTimezone: true }),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index().on(t.productId, t.sortOrder),
    index().on(t.status, t.uploadExpiresAt),
    // Tối đa 1 ảnh chính đang dùng mỗi sản phẩm
    uniqueIndex('product_images_primary_unique')
      .on(t.productId)
      .where(sql`${t.isPrimary} and ${t.status} = 'READY'`),
    check('product_images_size_check', sql`${t.sizeBytes} > 0`),
  ],
);

export type Product = typeof products.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;

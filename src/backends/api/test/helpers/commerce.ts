import { randomUUID } from 'node:crypto';
import {
  categories,
  eq,
  inventoryBalances,
  inventoryMovements,
  products,
  sql,
  type Product,
} from '@base/db';
import { decimal, COST_SCALE, QUANTITY_SCALE } from '@base/server-kit';
import { InventoryService } from '../../src/inventory/inventory.service';
import type { TestApp } from './app';

/** Mã ngắn duy nhất cho mỗi test (SKU, tên danh mục…) */
export function uniqueCode(prefix = 'T'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`.toUpperCase();
}

export async function createCategory(t: TestApp, name = uniqueCode('CAT')) {
  const [row] = await t.db.insert(categories).values({ name }).returning();
  return row!;
}

export interface CreateProductOptions {
  sku?: string;
  name?: string;
  categoryId?: string;
  sellingPrice?: string;
  purchasePrice?: string;
  minStock?: string;
  allowDecimalQuantity?: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
}

/** Tạo sản phẩm thẳng trong DB kèm dòng tồn = 0 */
export async function createProduct(
  t: TestApp,
  options: CreateProductOptions = {},
): Promise<Product> {
  const categoryId = options.categoryId ?? (await createCategory(t)).id;
  const sku = options.sku ?? uniqueCode('SKU');
  const [row] = await t.db
    .insert(products)
    .values({
      sku,
      name: options.name ?? `Sản phẩm ${sku}`,
      categoryId,
      unit: 'cái',
      sellingPrice: options.sellingPrice ?? '30000',
      purchasePrice: options.purchasePrice ?? '0',
      minStock: options.minStock ?? '0',
      allowDecimalQuantity: options.allowDecimalQuantity ?? false,
      status: options.status ?? 'ACTIVE',
    })
    .returning();
  await t.app.get(InventoryService).initBalance(t.db, row!.id);
  return row!;
}

/** Nhập kho trực tiếp qua InventoryService (giả lập phiếu nhập đã xác nhận) */
export async function stockIn(t: TestApp, productId: string, quantity: string, unitCost: string) {
  const inventory = t.app.get(InventoryService);
  return t.db.transaction((tx) =>
    inventory.apply(
      tx,
      {
        type: 'PURCHASE_IN',
        refType: 'PURCHASE_RECEIPT',
        refId: randomUUID(),
        refCode: 'TEST-IN',
        userId: null,
      },
      [
        {
          productId,
          quantity: decimal(quantity, QUANTITY_SCALE),
          unitCost: decimal(unitCost, COST_SCALE),
        },
      ],
    ),
  );
}

export async function getBalance(t: TestApp, productId: string) {
  const [row] = await t.db
    .select({ quantity: inventoryBalances.quantity, avgCost: inventoryBalances.avgCost })
    .from(inventoryBalances)
    .where(eq(inventoryBalances.productId, productId));
  return row!;
}

/** Σ quantity_change của sổ cái cho 1 sản phẩm (phải bằng tồn hiện tại) */
export async function ledgerSum(t: TestApp, productId: string): Promise<string> {
  const [row] = await t.db
    .select({
      total: sql<string>`coalesce(sum(${inventoryMovements.quantityChange}), 0)::numeric(14,3)`,
    })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.productId, productId));
  return row!.total;
}

/** Đối soát toàn bộ: danh sách sản phẩm có tồn khác Σ sổ cái (rỗng = khớp 100%) */
export async function ledgerMismatches(t: TestApp) {
  const result = await t.db.execute<{ product_id: string; quantity: string; ledger: string }>(sql`
    select b.product_id, b.quantity, coalesce(sum(m.quantity_change), 0)::numeric(14,3) as ledger
    from ${inventoryBalances} b
    left join ${inventoryMovements} m on m.product_id = b.product_id
    group by b.product_id, b.quantity
    having b.quantity <> coalesce(sum(m.quantity_change), 0)`);
  return result.rows;
}

import { inventoryBalances, products, sql, type SQL } from '@base/db';
import type { StockState } from '@base/shared';
import { cmp, decimal, isZero, QUANTITY_SCALE } from '@base/server-kit';

/**
 * Trạng thái tồn: OUT = 0; LOW = 0 < tồn ≤ tồn tối thiểu; IN_STOCK = còn lại (FR-028).
 * Dùng chung cho sản phẩm, tồn kho, dashboard.
 */
export function stockState(quantity: string, minStock: string): StockState {
  const q = decimal(quantity, QUANTITY_SCALE);
  if (isZero(q)) return 'OUT';
  return cmp(q, decimal(minStock, QUANTITY_SCALE)) <= 0 ? 'LOW' : 'IN_STOCK';
}

/** Điều kiện SQL tương ứng (truy vấn có join products + inventory_balances) */
export function stockStateWhere(state: StockState): SQL {
  switch (state) {
    case 'OUT':
      return sql`${inventoryBalances.quantity} = 0`;
    case 'LOW':
      return sql`${inventoryBalances.quantity} > 0 and ${inventoryBalances.quantity} <= ${products.minStock}`;
    case 'IN_STOCK':
      return sql`${inventoryBalances.quantity} > ${products.minStock} and ${inventoryBalances.quantity} > 0`;
  }
}

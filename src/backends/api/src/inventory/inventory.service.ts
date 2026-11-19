import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  inArray,
  inventoryBalances,
  inventoryMovements,
  products,
  type NewInventoryMovement,
} from '@base/db';
import type { AdjustmentReason, MovementRefType, MovementType, StockShortage } from '@base/shared';
import {
  add,
  COST_SCALE,
  decimal,
  decimalToString,
  div,
  isInteger,
  isNegative,
  isZero,
  mul,
  negate,
  notFound,
  QUANTITY_SCALE,
  sum,
  unprocessable,
  conflict,
  type Decimal,
} from '@base/server-kit';
import type { DbOrTx, Tx } from '../core/database';

/** Một thay đổi tồn kho (một dòng chứng từ) */
export interface StockChange {
  productId: string;
  /** Có dấu: dương = vào kho, âm = ra kho */
  quantity: Decimal;
  /**
   * Giá vốn đơn vị của hàng VÀO kho làm thay đổi giá vốn bình quân (nhập hàng, huỷ đơn bán).
   * Bỏ trống: ghi theo giá vốn bình quân hiện tại, bình quân không đổi (bán, điều chỉnh).
   */
  unitCost?: Decimal;
  /** Dòng chứng từ nguồn */
  refItemId?: string;
  /** Loại biến động riêng cho dòng (điều chỉnh tồn có cả tăng lẫn giảm); mặc định theo ctx */
  type?: MovementType;
}

export interface MovementContext {
  type: MovementType;
  refType: MovementRefType;
  refId: string;
  refCode: string;
  userId: string | null;
  reason?: AdjustmentReason | null;
  note?: string | null;
  /** Key lỗi khi thiếu hàng: bán hàng dùng `sales.insufficientStock` */
  shortageKey?: 'sales.insufficientStock' | 'inventory.negativeStock';
}

export interface AppliedMovement {
  productId: string;
  refItemId: string | null;
  quantityBefore: string;
  quantityAfter: string;
  /** Giá vốn đơn vị áp cho biến động (bán: giá vốn bình quân lúc chốt) */
  unitCost: string;
  avgCostAfter: string;
}

interface LockedBalance {
  productId: string;
  sku: string;
  name: string;
  allowDecimalQuantity: boolean;
  quantity: Decimal;
  avgCost: Decimal;
}

/**
 * Điểm DUY NHẤT được thay đổi tồn kho (constitution VII, research R4–R5). Mọi thay đổi:
 * khoá dòng `inventory_balances` theo thứ tự product_id cố định (không deadlock) → kiểm tra đủ hàng
 * / số lượng lẻ → cập nhật tồn + giá vốn bình quân → ghi sổ cái `inventory_movements`.
 * Luôn gọi trong transaction của chứng từ để tất cả thành công hoặc không có gì thay đổi.
 */
@Injectable()
export class InventoryService {
  /** Tạo dòng tồn = 0 cho sản phẩm mới (cùng transaction tạo sản phẩm) */
  async initBalance(tx: DbOrTx, productId: string): Promise<void> {
    await tx.insert(inventoryBalances).values({ productId }).onConflictDoNothing();
  }

  private async lockBalances(tx: Tx, productIds: string[]): Promise<Map<string, LockedBalance>> {
    const rows = await tx
      .select({
        productId: inventoryBalances.productId,
        quantity: inventoryBalances.quantity,
        avgCost: inventoryBalances.avgCost,
        sku: products.sku,
        name: products.name,
        allowDecimalQuantity: products.allowDecimalQuantity,
      })
      .from(inventoryBalances)
      .innerJoin(products, eq(products.id, inventoryBalances.productId))
      .where(inArray(inventoryBalances.productId, productIds))
      .orderBy(asc(inventoryBalances.productId))
      .for('update', { of: inventoryBalances });
    if (rows.length !== productIds.length) throw notFound('products.notFound');
    return new Map(
      rows.map((r) => [
        r.productId,
        {
          ...r,
          quantity: decimal(r.quantity, QUANTITY_SCALE),
          avgCost: decimal(r.avgCost, COST_SCALE),
        },
      ]),
    );
  }

  /** Kiểm tra số lượng lẻ cho sản phẩm chỉ nhận số nguyên */
  private assertQuantities(changes: StockChange[], balances: Map<string, LockedBalance>) {
    const invalid = changes.filter(
      (c) => !balances.get(c.productId)!.allowDecimalQuantity && !isInteger(c.quantity),
    );
    if (invalid.length) {
      const first = balances.get(invalid[0]!.productId)!;
      throw unprocessable(
        'inventory.decimalNotAllowed',
        { sku: first.sku },
        invalid.map((c) => ({ productId: c.productId, sku: balances.get(c.productId)!.sku })),
      );
    }
  }

  /** Thiếu hàng (tính trên tổng thay đổi của mỗi sản phẩm) → lỗi kèm danh sách theo sản phẩm */
  private assertSufficient(
    changes: StockChange[],
    balances: Map<string, LockedBalance>,
    key: NonNullable<MovementContext['shortageKey']>,
  ) {
    const shortages: StockShortage[] = [];
    for (const balance of balances.values()) {
      const own = changes.filter((c) => c.productId === balance.productId);
      const net = sum(
        own.map((c) => c.quantity),
        QUANTITY_SCALE,
      );
      if (isNegative(add(balance.quantity, net))) {
        const out = sum(
          own.filter((c) => isNegative(c.quantity)).map((c) => negate(c.quantity)),
          QUANTITY_SCALE,
        );
        shortages.push({
          productId: balance.productId,
          sku: balance.sku,
          name: balance.name,
          requested: decimalToString(out),
          available: decimalToString(balance.quantity),
        });
      }
    }
    if (shortages.length) {
      const first = shortages[0]!;
      throw conflict(
        key,
        { sku: first.sku, requested: first.requested, available: first.available },
        shortages,
      );
    }
  }

  /**
   * Áp dụng thay đổi tồn kho trong transaction `tx`. Trả về biến động đã ghi theo đúng thứ tự
   * `changes` (để chứng từ lưu giá vốn từng dòng).
   */
  async apply(tx: Tx, ctx: MovementContext, changes: StockChange[]): Promise<AppliedMovement[]> {
    if (!changes.length) return [];
    if (changes.some((c) => isZero(c.quantity))) throw unprocessable('inventory.noChange');

    const productIds = [...new Set(changes.map((c) => c.productId))].sort();
    const balances = await this.lockBalances(tx, productIds);
    this.assertQuantities(changes, balances);
    this.assertSufficient(changes, balances, ctx.shortageKey ?? 'inventory.negativeStock');

    const now = new Date();
    const applied: AppliedMovement[] = [];
    const rows: NewInventoryMovement[] = [];
    for (const change of changes) {
      const state = balances.get(change.productId)!;
      const before = state.quantity;
      const after = add(before, change.quantity);
      const quantityChange = decimal(change.quantity, QUANTITY_SCALE);
      let unitCost = state.avgCost;
      if (change.unitCost && !isNegative(change.quantity)) {
        unitCost = decimal(change.unitCost, COST_SCALE);
        // Bình quân gia quyền di động: (q×avg + q_in×cost) / (q + q_in)
        state.avgCost = isZero(after)
          ? unitCost
          : div(
              add(
                mul(before, state.avgCost, COST_SCALE),
                mul(quantityChange, unitCost, COST_SCALE),
              ),
              after,
              COST_SCALE,
            );
      }
      state.quantity = after;
      const movement = {
        productId: change.productId,
        refItemId: change.refItemId ?? null,
        quantityBefore: decimalToString(before),
        quantityAfter: decimalToString(after),
        unitCost: decimalToString(unitCost),
        avgCostAfter: decimalToString(state.avgCost),
      };
      applied.push(movement);
      rows.push({
        ...movement,
        type: change.type ?? ctx.type,
        quantityChange: decimalToString(quantityChange),
        refType: ctx.refType,
        refId: ctx.refId,
        refCode: ctx.refCode,
        reason: ctx.reason ?? null,
        note: ctx.note ?? null,
        createdBy: ctx.userId,
        createdAt: now,
      });
    }

    await tx.insert(inventoryMovements).values(rows);
    for (const state of balances.values()) {
      await tx
        .update(inventoryBalances)
        .set({
          quantity: decimalToString(state.quantity),
          avgCost: decimalToString(state.avgCost),
          lastMovementAt: now,
        })
        .where(eq(inventoryBalances.productId, state.productId));
    }
    await tx
      .update(products)
      .set({ hasTransactions: true })
      .where(and(inArray(products.id, productIds), eq(products.hasTransactions, false)));
    return applied;
  }

  /** Tồn + giá vốn bình quân hiện tại (không khoá) */
  async getBalances(db: DbOrTx, productIds: string[]) {
    if (!productIds.length) return new Map<string, { quantity: string; avgCost: string }>();
    const rows = await db
      .select({
        productId: inventoryBalances.productId,
        quantity: inventoryBalances.quantity,
        avgCost: inventoryBalances.avgCost,
      })
      .from(inventoryBalances)
      .where(inArray(inventoryBalances.productId, productIds));
    return new Map(rows.map((r) => [r.productId, { quantity: r.quantity, avgCost: r.avgCost }]));
  }
}

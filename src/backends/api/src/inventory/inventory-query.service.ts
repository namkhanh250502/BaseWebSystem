import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  categories,
  count,
  desc,
  eq,
  ilike,
  inventoryBalances,
  inventoryMovements,
  or,
  products,
  sql,
} from '@base/db';
import {
  type InventoryItemDto,
  type InventoryMovementDto,
  type InventorySummary,
  type listInventoryQuerySchema,
  type listMovementsQuerySchema,
} from '@base/shared';
import type { z } from 'zod';
import { InjectDb, type Database } from '../core/database';
import { businessDay, containsPattern, iso, loadUserRefs, pageMeta } from '../core/query-helpers';
import { stockState, stockStateWhere } from './stock-state';

type ListQuery = z.infer<typeof listInventoryQuerySchema>;
type MovementsQuery = z.infer<typeof listMovementsQuerySchema>;

/** Người xem có quyền inventory.viewValue thì thấy giá vốn / giá trị tồn */
export interface InventoryViewer {
  canViewValue: boolean;
}

/** Giá trị tồn = SL × giá vốn bình quân, làm tròn tới đồng xu */
const valueSql = sql<string>`round(${inventoryBalances.quantity} * ${inventoryBalances.avgCost}, 2)`;

@Injectable()
export class InventoryQueryService {
  constructor(@InjectDb() private readonly db: Database) {}

  private itemQuery() {
    return this.db
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        unit: products.unit,
        productStatus: products.status,
        minStock: products.minStock,
        category: { id: categories.id, name: categories.name },
        quantity: inventoryBalances.quantity,
        avgCost: inventoryBalances.avgCost,
        value: valueSql,
        lastMovementAt: inventoryBalances.lastMovementAt,
      })
      .from(inventoryBalances)
      .innerJoin(products, eq(products.id, inventoryBalances.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId));
  }

  toItemDto(
    row: Awaited<ReturnType<InventoryQueryService['itemQuery']>>[number],
    viewer: InventoryViewer,
  ): InventoryItemDto {
    return {
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      category: row.category,
      productStatus: row.productStatus,
      quantity: row.quantity,
      minStock: row.minStock,
      state: stockState(row.quantity, row.minStock),
      ...(viewer.canViewValue ? { avgCost: row.avgCost, value: row.value } : {}),
      lastMovementAt: iso(row.lastMovementAt),
    };
  }

  private filters(query: Omit<ListQuery, 'page' | 'pageSize' | 'sortBy' | 'sortOrder'>) {
    const pattern = query.search ? containsPattern(query.search) : undefined;
    return and(
      pattern ? or(ilike(products.name, pattern), ilike(products.sku, pattern)) : undefined,
      query.categoryId ? eq(products.categoryId, query.categoryId) : undefined,
      query.status ? eq(products.status, query.status) : undefined,
    );
  }

  /** Danh sách tồn hiện tại */
  async list(query: ListQuery, viewer: InventoryViewer) {
    const { page, pageSize, stockState: state, sortBy, sortOrder } = query;
    const where = and(this.filters(query), state ? stockStateWhere(state) : undefined);
    const sortColumn = {
      name: products.name,
      sku: products.sku,
      quantity: inventoryBalances.quantity,
      value: valueSql,
    }[sortBy];
    const order = sortOrder === 'asc' ? asc : desc;
    const [rows, [total]] = await Promise.all([
      this.itemQuery()
        .where(where)
        .orderBy(order(sortColumn), asc(products.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(inventoryBalances)
        .innerJoin(products, eq(products.id, inventoryBalances.productId))
        .where(where),
    ]);
    return {
      items: rows.map((r) => this.toItemDto(r, viewer)),
      meta: pageMeta(page, pageSize, total?.value),
    };
  }

  /** Tổng hợp theo cùng bộ lọc (bỏ qua lọc trạng thái tồn): tổng SL, giá trị, số sắp hết / hết */
  async summary(query: ListQuery, viewer: InventoryViewer): Promise<InventorySummary> {
    const [row] = await this.db
      .select({
        totalQuantity: sql<string>`coalesce(sum(${inventoryBalances.quantity}), 0)::numeric(14,3)`,
        totalValue: sql<string>`coalesce(sum(${valueSql}), 0)::numeric(18,2)`,
        lowCount: sql<number>`(count(*) filter (where ${stockStateWhere('LOW')}))::int`,
        outCount: sql<number>`(count(*) filter (where ${stockStateWhere('OUT')}))::int`,
      })
      .from(inventoryBalances)
      .innerJoin(products, eq(products.id, inventoryBalances.productId))
      .where(this.filters(query));
    return {
      totalQuantity: row?.totalQuantity ?? '0.000',
      ...(viewer.canViewValue ? { totalValue: row?.totalValue ?? '0.00' } : {}),
      lowCount: row?.lowCount ?? 0,
      outCount: row?.outCount ?? 0,
    };
  }

  /** Sản phẩm đang kinh doanh sắp hết / hết hàng (dashboard) */
  async alerts(state: 'LOW' | 'OUT', limit: number, viewer: InventoryViewer) {
    const where = and(eq(products.status, 'ACTIVE'), stockStateWhere(state));
    const [rows, [total]] = await Promise.all([
      this.itemQuery()
        .where(where)
        .orderBy(asc(inventoryBalances.quantity), asc(products.name))
        .limit(limit),
      this.db
        .select({ value: count() })
        .from(inventoryBalances)
        .innerJoin(products, eq(products.id, inventoryBalances.productId))
        .where(where),
    ]);
    return { items: rows.map((r) => this.toItemDto(r, viewer)), total: total?.value ?? 0 };
  }

  /** Sổ biến động: lọc sản phẩm, loại, chứng từ, khoảng ngày (giờ VN), tìm mã chứng từ / SKU */
  async movements(query: MovementsQuery, viewer: InventoryViewer) {
    const { page, pageSize, productId, type, refType, dateFrom, dateTo, search, sortOrder } = query;
    const pattern = search ? containsPattern(search) : undefined;
    const day = businessDay(inventoryMovements.createdAt);
    const where = and(
      productId ? eq(inventoryMovements.productId, productId) : undefined,
      type ? eq(inventoryMovements.type, type) : undefined,
      refType ? eq(inventoryMovements.refType, refType) : undefined,
      dateFrom ? sql`${day} >= ${dateFrom}` : undefined,
      dateTo ? sql`${day} <= ${dateTo}` : undefined,
      pattern
        ? or(ilike(inventoryMovements.refCode, pattern), ilike(products.sku, pattern))
        : undefined,
    );
    const order = sortOrder === 'asc' ? asc : desc;
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          movement: inventoryMovements,
          product: { id: products.id, sku: products.sku, name: products.name, unit: products.unit },
        })
        .from(inventoryMovements)
        .innerJoin(products, eq(products.id, inventoryMovements.productId))
        .where(where)
        .orderBy(order(inventoryMovements.createdAt), order(inventoryMovements.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(inventoryMovements)
        .innerJoin(products, eq(products.id, inventoryMovements.productId))
        .where(where),
    ]);
    const userRef = await loadUserRefs(
      this.db,
      rows.map((r) => r.movement.createdBy),
    );
    const items: InventoryMovementDto[] = rows.map(({ movement: m, product }) => ({
      id: m.id,
      createdAt: m.createdAt.toISOString(),
      product,
      type: m.type,
      quantityChange: m.quantityChange,
      quantityBefore: m.quantityBefore,
      quantityAfter: m.quantityAfter,
      ...(viewer.canViewValue ? { unitCost: m.unitCost, avgCostAfter: m.avgCostAfter } : {}),
      ref: { type: m.refType, id: m.refId, code: m.refCode },
      reason: m.reason,
      note: m.note,
      createdBy: userRef(m.createdBy),
    }));
    return { items, meta: pageMeta(page, pageSize, total?.value) };
  }
}

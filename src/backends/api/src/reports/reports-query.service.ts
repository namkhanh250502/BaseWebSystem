import { Injectable } from '@nestjs/common';
import {
  and,
  categories,
  eq,
  inventoryBalances,
  inventoryMovements,
  products,
  purchaseReceiptItems,
  purchaseReceipts,
  salesOrderItems,
  salesOrders,
  sql,
  suppliers,
  type SQL,
} from '@base/db';
import {
  businessDate,
  type InventoryReportRow,
  type ProductSalesRow,
  type ProfitReport,
  type PurchaseReport,
  type reportPagedQuerySchema,
  type reportRangeQuerySchema,
  type SalesPeriodReport,
  type salesByProductQuerySchema,
  type SalesSummaryDto,
} from '@base/shared';
import {
  cmp,
  COST_SCALE,
  decimal,
  decimalToString,
  div,
  MONEY_SCALE,
  mul,
  QUANTITY_SCALE,
  sub,
} from '@base/server-kit';
import type { z } from 'zod';
import { InjectDb, type Database } from '../core/database';
import { businessDay, pageMeta } from '../core/query-helpers';
import { InventoryQueryService, type InventoryViewer } from '../inventory/inventory-query.service';

type RangeQuery = z.infer<typeof reportRangeQuerySchema>;
type PagedQuery = z.infer<typeof reportPagedQuerySchema>;
type ByProductQuery = z.infer<typeof salesByProductQuerySchema>;

/** Số dòng tối đa của báo cáo lịch sử nhập (khoảng ≤ 366 ngày, quy mô cửa hàng nhỏ) */
const PURCHASE_REPORT_LIMIT = 1000;
const DASHBOARD_ALERT_LIMIT = 10;

/** Các ngày (YYYY-MM-DD) từ `from` tới `to` */
function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`);) {
    days.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86_400_000);
  }
  return days;
}

/** Các tháng (YYYY-MM) giao với khoảng ngày */
function eachMonth(from: string, to: string): string[] {
  return [...new Set(eachDay(from, to).map((d) => d.slice(0, 7)))];
}

/** a − b (tiền, chính xác thập phân) */
function subtractMoney(a: string, b: string): string {
  return decimalToString(sub(decimal(a, MONEY_SCALE), decimal(b, MONEY_SCALE)));
}

/** a / b × 100 (2 chữ số lẻ); null khi b ≤ 0 */
function percent(part: string, whole: string): string | null {
  const base = decimal(whole, MONEY_SCALE);
  if (cmp(base, decimal(0, MONEY_SCALE)) <= 0) return null;
  return decimalToString(
    div(mul(decimal(part, MONEY_SCALE), decimal(100, 0), MONEY_SCALE), base, 2),
  );
}

/** Số lượng × giá vốn → tiền */
function multiplyMoney(quantity: string, unitCost: string): string {
  return decimalToString(
    mul(decimal(quantity, QUANTITY_SCALE), decimal(unitCost, COST_SCALE), MONEY_SCALE),
  );
}

/**
 * Báo cáo bán hàng / nhập hàng / tồn kho (FR-030–FR-033). Chỉ tính chứng từ CONFIRMED;
 * doanh thu = Σ net_amount (sau mọi chiết khấu), giá vốn = Σ cost_amount lưu lúc chốt đơn
 * (bình quân gia quyền lịch sử, không dùng giá nhập hiện tại); ngày theo giờ Việt Nam.
 */
@Injectable()
export class ReportsQueryService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly inventoryQuery: InventoryQueryService,
  ) {}

  private soldDay() {
    return businessDay(salesOrders.confirmedAt);
  }

  /** Điều kiện chung của dòng bán: đơn đã chốt trong khoảng ngày + lọc sản phẩm / danh mục */
  private soldItemsWhere(q: RangeQuery): SQL | undefined {
    const day = this.soldDay();
    return and(
      eq(salesOrders.status, 'CONFIRMED'),
      sql`${day} between ${q.dateFrom} and ${q.dateTo}`,
      q.productId ? eq(salesOrderItems.productId, q.productId) : undefined,
      q.categoryId ? eq(products.categoryId, q.categoryId) : undefined,
    );
  }

  /** Doanh thu theo ngày hoặc tháng, điền đủ kỳ không có bán (biểu đồ liền mạch) */
  async salesByPeriod(q: RangeQuery, granularity: 'day' | 'month'): Promise<SalesPeriodReport> {
    const day = this.soldDay();
    const period =
      granularity === 'day'
        ? sql<string>`to_char(${day}, 'YYYY-MM-DD')`
        : sql<string>`to_char(${day}, 'YYYY-MM')`;
    const rows = await this.db
      .select({
        period,
        orderCount: sql<number>`count(distinct ${salesOrders.id})::int`,
        revenue: sql<string>`coalesce(sum(${salesOrderItems.netAmount}), 0)::numeric(18,2)`,
        cost: sql<string>`coalesce(sum(${salesOrderItems.costAmount}), 0)::numeric(18,2)`,
      })
      .from(salesOrderItems)
      .innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.orderId))
      .innerJoin(products, eq(products.id, salesOrderItems.productId))
      .where(this.soldItemsWhere(q))
      .groupBy(period);
    const [totals] = await this.db
      .select({
        orderCount: sql<number>`count(distinct ${salesOrders.id})::int`,
        revenue: sql<string>`coalesce(sum(${salesOrderItems.netAmount}), 0)::numeric(18,2)`,
        cost: sql<string>`coalesce(sum(${salesOrderItems.costAmount}), 0)::numeric(18,2)`,
        grossProfit: sql<string>`(coalesce(sum(${salesOrderItems.netAmount}), 0) - coalesce(sum(${salesOrderItems.costAmount}), 0))::numeric(18,2)`,
      })
      .from(salesOrderItems)
      .innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.orderId))
      .innerJoin(products, eq(products.id, salesOrderItems.productId))
      .where(this.soldItemsWhere(q));
    const byPeriod = new Map(rows.map((r) => [r.period, r]));
    const periods =
      granularity === 'day' ? eachDay(q.dateFrom, q.dateTo) : eachMonth(q.dateFrom, q.dateTo);
    return {
      rows: periods.map((p) => {
        const r = byPeriod.get(p);
        const revenue = r?.revenue ?? '0.00';
        const cost = r?.cost ?? '0.00';
        return {
          period: p,
          orderCount: r?.orderCount ?? 0,
          revenue,
          cost,
          grossProfit: subtractMoney(revenue, cost),
        };
      }),
      totals: {
        orderCount: totals?.orderCount ?? 0,
        revenue: totals?.revenue ?? '0.00',
        cost: totals?.cost ?? '0.00',
        grossProfit: totals?.grossProfit ?? '0.00',
      },
    };
  }

  /** Bán theo sản phẩm; sắp theo SL (= bán chạy), doanh thu hoặc lợi nhuận gộp */
  async salesByProduct(q: ByProductQuery) {
    const revenue = sql<string>`coalesce(sum(${salesOrderItems.netAmount}), 0)::numeric(18,2)`;
    const cost = sql<string>`coalesce(sum(${salesOrderItems.costAmount}), 0)::numeric(18,2)`;
    const quantity = sql<string>`coalesce(sum(${salesOrderItems.quantity}), 0)::numeric(14,3)`;
    const profit = sql<string>`(coalesce(sum(${salesOrderItems.netAmount}), 0) - coalesce(sum(${salesOrderItems.costAmount}), 0))::numeric(18,2)`;
    const sortExpr = { quantity, revenue, grossProfit: profit }[q.sortBy];
    const base = () =>
      this.db
        .select({
          product: { id: products.id, sku: products.sku, name: products.name, unit: products.unit },
          category: { id: categories.id, name: categories.name },
          quantity,
          revenue,
          cost,
          grossProfit: profit,
          marginPct: sql<string | null>`case when sum(${salesOrderItems.netAmount}) > 0
            then round((sum(${salesOrderItems.netAmount}) - sum(${salesOrderItems.costAmount})) * 100 / sum(${salesOrderItems.netAmount}), 2)::text
            else null end`,
        })
        .from(salesOrderItems)
        .innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.orderId))
        .innerJoin(products, eq(products.id, salesOrderItems.productId))
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(this.soldItemsWhere(q))
        .groupBy(products.id, categories.id);
    const [rows, [total]] = await Promise.all([
      base()
        .orderBy(sql`${sortExpr} desc`, products.sku)
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db
        .select({ value: sql<number>`count(distinct ${salesOrderItems.productId})::int` })
        .from(salesOrderItems)
        .innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.orderId))
        .innerJoin(products, eq(products.id, salesOrderItems.productId))
        .where(this.soldItemsWhere(q)),
    ]);
    const items: ProductSalesRow[] = rows;
    return { items, meta: pageMeta(q.page, q.pageSize, total?.value) };
  }

  /** Lợi nhuận gộp ước tính: tách rõ doanh thu, chiết khấu, giá vốn, lợi nhuận (FR-032) */
  async profit(q: RangeQuery): Promise<ProfitReport> {
    const day = this.soldDay();
    const sums = {
      grossSales: sql<string>`coalesce(sum(${salesOrderItems.lineAmount}), 0)::numeric(18,2)`,
      orderDiscounts: sql<string>`coalesce(sum(${salesOrderItems.allocatedOrderDiscount}), 0)::numeric(18,2)`,
      netRevenue: sql<string>`coalesce(sum(${salesOrderItems.netAmount}), 0)::numeric(18,2)`,
      costOfGoodsSold: sql<string>`coalesce(sum(${salesOrderItems.costAmount}), 0)::numeric(18,2)`,
      grossProfit: sql<string>`(coalesce(sum(${salesOrderItems.netAmount}), 0) - coalesce(sum(${salesOrderItems.costAmount}), 0))::numeric(18,2)`,
    };
    const from = () =>
      this.db
        .select({ ...sums })
        .from(salesOrderItems)
        .innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.orderId))
        .innerJoin(products, eq(products.id, salesOrderItems.productId))
        .where(this.soldItemsWhere(q));
    const dayText = sql<string>`to_char(${day}, 'YYYY-MM-DD')`;
    const [[totals], [orders], daily] = await Promise.all([
      from(),
      this.db
        .select({ value: sql<number>`count(distinct ${salesOrders.id})::int` })
        .from(salesOrderItems)
        .innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.orderId))
        .innerJoin(products, eq(products.id, salesOrderItems.productId))
        .where(this.soldItemsWhere(q)),
      this.db
        .select({
          date: dayText,
          netRevenue: sums.netRevenue,
          costOfGoodsSold: sums.costOfGoodsSold,
          grossProfit: sums.grossProfit,
        })
        .from(salesOrderItems)
        .innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.orderId))
        .innerJoin(products, eq(products.id, salesOrderItems.productId))
        .where(this.soldItemsWhere(q))
        .groupBy(dayText)
        .orderBy(dayText),
    ]);
    return {
      grossSales: totals?.grossSales ?? '0.00',
      orderDiscounts: totals?.orderDiscounts ?? '0.00',
      netRevenue: totals?.netRevenue ?? '0.00',
      costOfGoodsSold: totals?.costOfGoodsSold ?? '0.00',
      grossProfit: totals?.grossProfit ?? '0.00',
      marginPct: percent(totals?.grossProfit ?? '0', totals?.netRevenue ?? '0'),
      orderCount: orders?.value ?? 0,
      byDay: daily,
    };
  }

  /** Lịch sử nhập (phiếu đã xác nhận theo ngày nhập), lọc nhà cung cấp / sản phẩm / danh mục */
  async purchases(q: RangeQuery): Promise<PurchaseReport> {
    const itemFilter =
      q.productId || q.categoryId
        ? sql`exists (select 1 from ${purchaseReceiptItems}
            join ${products} on ${products.id} = ${purchaseReceiptItems.productId}
            where ${purchaseReceiptItems.receiptId} = ${purchaseReceipts.id}
            ${q.productId ? sql`and ${purchaseReceiptItems.productId} = ${q.productId}` : sql``}
            ${q.categoryId ? sql`and ${products.categoryId} = ${q.categoryId}` : sql``})`
        : undefined;
    const where = and(
      eq(purchaseReceipts.status, 'CONFIRMED'),
      sql`${purchaseReceipts.receiptDate} between ${q.dateFrom} and ${q.dateTo}`,
      q.supplierId ? eq(purchaseReceipts.supplierId, q.supplierId) : undefined,
      itemFilter,
    );
    const [rows, [totals]] = await Promise.all([
      this.db
        .select({
          receipt: {
            id: purchaseReceipts.id,
            code: purchaseReceipts.code,
            receiptDate: purchaseReceipts.receiptDate,
          },
          supplier: { id: suppliers.id, name: suppliers.name },
          itemCount: sql<number>`(select count(*) from ${purchaseReceiptItems} where ${purchaseReceiptItems.receiptId} = ${purchaseReceipts.id})::int`,
          totalAmount: purchaseReceipts.totalAmount,
        })
        .from(purchaseReceipts)
        .innerJoin(suppliers, eq(suppliers.id, purchaseReceipts.supplierId))
        .where(where)
        .orderBy(sql`${purchaseReceipts.receiptDate} desc`, sql`${purchaseReceipts.code} desc`)
        .limit(PURCHASE_REPORT_LIMIT),
      this.db
        .select({
          receiptCount: sql<number>`count(*)::int`,
          totalAmount: sql<string>`coalesce(sum(${purchaseReceipts.totalAmount}), 0)::numeric(18,2)`,
        })
        .from(purchaseReceipts)
        .where(where),
    ]);
    return {
      rows,
      totals: {
        receiptCount: totals?.receiptCount ?? 0,
        totalAmount: totals?.totalAmount ?? '0.00',
      },
    };
  }

  /** Nhập – xuất – tồn theo sản phẩm từ sổ cái: đầu kỳ, vào, ra, cuối kỳ */
  async inventory(q: PagedQuery, viewer: InventoryViewer) {
    const day = businessDay(inventoryMovements.createdAt);
    const opening = sql<string>`coalesce(sum(${inventoryMovements.quantityChange}) filter (where ${day} < ${q.dateFrom}), 0)::numeric(14,3)`;
    const inQty = sql<string>`coalesce(sum(${inventoryMovements.quantityChange}) filter (where ${day} between ${q.dateFrom} and ${q.dateTo} and ${inventoryMovements.quantityChange} > 0), 0)::numeric(14,3)`;
    const outQty = sql<string>`coalesce(-sum(${inventoryMovements.quantityChange}) filter (where ${day} between ${q.dateFrom} and ${q.dateTo} and ${inventoryMovements.quantityChange} < 0), 0)::numeric(14,3)`;
    const closing = sql<string>`coalesce(sum(${inventoryMovements.quantityChange}) filter (where ${day} <= ${q.dateTo}), 0)::numeric(14,3)`;
    const where = and(
      q.productId ? eq(products.id, q.productId) : undefined,
      q.categoryId ? eq(products.categoryId, q.categoryId) : undefined,
    );
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          product: { id: products.id, sku: products.sku, name: products.name, unit: products.unit },
          openingQty: opening,
          inQty,
          outQty,
          closingQty: closing,
          avgCost: inventoryBalances.avgCost,
        })
        .from(products)
        .innerJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
        .leftJoin(inventoryMovements, eq(inventoryMovements.productId, products.id))
        .where(where)
        .groupBy(products.id, inventoryBalances.avgCost)
        .orderBy(products.sku)
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db
        .select({ value: sql<number>`count(*)::int` })
        .from(products)
        .where(where),
    ]);
    const items: InventoryReportRow[] = rows.map(({ avgCost, ...r }) => ({
      ...r,
      ...(viewer.canViewValue ? { closingValue: multiplyMoney(r.closingQty, avgCost) } : {}),
    }));
    return { items, meta: pageMeta(q.page, q.pageSize, total?.value) };
  }

  /** Số liệu dashboard bán hàng (FR-030) */
  async salesSummary(viewer: InventoryViewer): Promise<SalesSummaryDto> {
    const today = businessDate();
    const [[productCount], [supplierCount], [stock], [sales], [purchase], low, out] =
      await Promise.all([
        this.db
          .select({ value: sql<number>`count(*)::int` })
          .from(products)
          .where(eq(products.status, 'ACTIVE')),
        this.db
          .select({ value: sql<number>`count(*)::int` })
          .from(suppliers)
          .where(eq(suppliers.status, 'ACTIVE')),
        this.db
          .select({
            quantity: sql<string>`coalesce(sum(${inventoryBalances.quantity}), 0)::numeric(14,3)`,
            value: sql<string>`coalesce(sum(round(${inventoryBalances.quantity} * ${inventoryBalances.avgCost}, 2)), 0)::numeric(18,2)`,
          })
          .from(inventoryBalances),
        this.db
          .select({
            revenue: sql<string>`coalesce(sum(${salesOrders.totalAmount}), 0)::numeric(18,2)`,
            orderCount: sql<number>`count(*)::int`,
          })
          .from(salesOrders)
          .where(and(eq(salesOrders.status, 'CONFIRMED'), sql`${this.soldDay()} = ${today}`)),
        this.db
          .select({
            amount: sql<string>`coalesce(sum(${purchaseReceipts.totalAmount}), 0)::numeric(18,2)`,
          })
          .from(purchaseReceipts)
          .where(
            and(
              eq(purchaseReceipts.status, 'CONFIRMED'),
              sql`${businessDay(purchaseReceipts.confirmedAt)} = ${today}`,
            ),
          ),
        this.inventoryQuery.alerts('LOW', DASHBOARD_ALERT_LIMIT, viewer),
        this.inventoryQuery.alerts('OUT', DASHBOARD_ALERT_LIMIT, viewer),
      ]);
    return {
      productCount: productCount?.value ?? 0,
      supplierCount: supplierCount?.value ?? 0,
      totalStockQuantity: stock?.quantity ?? '0.000',
      ...(viewer.canViewValue ? { inventoryValue: stock?.value ?? '0.00' } : {}),
      today: {
        date: today,
        revenue: sales?.revenue ?? '0.00',
        orderCount: sales?.orderCount ?? 0,
        purchaseAmount: purchase?.amount ?? '0.00',
      },
      lowStockCount: low.total,
      outOfStockCount: out.total,
      lowStock: low.items,
      outOfStock: out.items,
    };
  }
}

import { z } from 'zod';
import { dateOnlySchema, REPORT_MAX_RANGE_DAYS } from '../constants/commerce';
import { inventoryItemDtoSchema } from './inventory';
import { paginationQuerySchema } from './common';

const DAY_MS = 24 * 60 * 60 * 1000;

const rangeFields = {
  dateFrom: dateOnlySchema,
  dateTo: dateOnlySchema,
  productId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  supplierId: z.uuid().optional(),
};

/** Kiểm tra dateFrom ≤ dateTo và khoảng tối đa REPORT_MAX_RANGE_DAYS ngày (tính cả 2 đầu) */
function withValidRange<T extends z.ZodType<{ dateFrom: string; dateTo: string }>>(schema: T) {
  return schema.superRefine((q, ctx) => {
    const days = (Date.parse(q.dateTo) - Date.parse(q.dateFrom)) / DAY_MS + 1;
    if (days < 1) {
      ctx.addIssue({ code: 'custom', path: ['dateTo'], message: 'reports.invalidRange' });
    } else if (days > REPORT_MAX_RANGE_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['dateTo'], message: 'reports.rangeTooLarge' });
    }
  });
}

/** Khoảng ngày (giờ Việt Nam, gồm cả 2 đầu) + bộ lọc chung của báo cáo */
export const reportRangeQuerySchema = withValidRange(z.object(rangeFields));

export const SALES_BY_PRODUCT_SORT = ['quantity', 'revenue', 'grossProfit'] as const;

export const salesByProductQuerySchema = withValidRange(
  z.object({
    ...rangeFields,
    ...paginationQuerySchema.shape,
    sortBy: z.enum(SALES_BY_PRODUCT_SORT).default('revenue'),
  }),
);

export const reportPagedQuerySchema = withValidRange(
  z.object({ ...rangeFields, ...paginationQuerySchema.shape }),
);

const salesTotalsSchema = z.object({
  orderCount: z.number().int(),
  /** Doanh thu thuần (sau mọi chiết khấu) */
  revenue: z.string(),
  /** Giá vốn hàng bán (giá vốn lịch sử lưu trên dòng đơn) */
  cost: z.string(),
  grossProfit: z.string(),
});

export const salesPeriodReportSchema = z.object({
  rows: z.array(salesTotalsSchema.extend({ period: z.string() })),
  totals: salesTotalsSchema,
});

const productRefSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
});

export const productSalesRowSchema = z.object({
  product: productRefSchema,
  category: z.object({ id: z.uuid(), name: z.string() }),
  quantity: z.string(),
  revenue: z.string(),
  cost: z.string(),
  grossProfit: z.string(),
  /** Biên lợi nhuận gộp (%), null khi doanh thu = 0 */
  marginPct: z.string().nullable(),
});

export const purchaseReportSchema = z.object({
  rows: z.array(
    z.object({
      receipt: z.object({ id: z.uuid(), code: z.string(), receiptDate: z.string() }),
      supplier: z.object({ id: z.uuid(), name: z.string() }),
      itemCount: z.number().int(),
      totalAmount: z.string(),
    }),
  ),
  totals: z.object({ receiptCount: z.number().int(), totalAmount: z.string() }),
});

export const inventoryReportRowSchema = z.object({
  product: productRefSchema,
  openingQty: z.string(),
  inQty: z.string(),
  outQty: z.string(),
  closingQty: z.string(),
  /** Giá trị tồn hiện tại (SL cuối kỳ × giá vốn bình quân hiện tại) — khi có inventory.viewValue */
  closingValue: z.string().optional(),
});

export const profitReportSchema = z.object({
  /** Tổng thành tiền dòng (đã trừ chiết khấu dòng) */
  grossSales: z.string(),
  /** Chiết khấu cấp đơn đã phân bổ */
  orderDiscounts: z.string(),
  netRevenue: z.string(),
  costOfGoodsSold: z.string(),
  grossProfit: z.string(),
  marginPct: z.string().nullable(),
  orderCount: z.number().int(),
  byDay: z.array(
    z.object({
      date: z.string(),
      netRevenue: z.string(),
      costOfGoodsSold: z.string(),
      grossProfit: z.string(),
    }),
  ),
});

export const salesSummaryDtoSchema = z.object({
  productCount: z.number().int(),
  supplierCount: z.number().int(),
  totalStockQuantity: z.string(),
  /** Giá trị tồn kho — khi có inventory.viewValue */
  inventoryValue: z.string().optional(),
  today: z.object({
    date: z.string(),
    revenue: z.string(),
    orderCount: z.number().int(),
    purchaseAmount: z.string(),
  }),
  lowStockCount: z.number().int(),
  outOfStockCount: z.number().int(),
  lowStock: z.array(inventoryItemDtoSchema),
  outOfStock: z.array(inventoryItemDtoSchema),
});

export type ReportRangeQuery = z.input<typeof reportRangeQuerySchema>;
export type SalesByProductQuery = z.input<typeof salesByProductQuerySchema>;
export type ReportPagedQuery = z.input<typeof reportPagedQuerySchema>;
export type SalesPeriodReport = z.infer<typeof salesPeriodReportSchema>;
export type ProductSalesRow = z.infer<typeof productSalesRowSchema>;
export type PurchaseReport = z.infer<typeof purchaseReportSchema>;
export type InventoryReportRow = z.infer<typeof inventoryReportRowSchema>;
export type ProfitReport = z.infer<typeof profitReportSchema>;
export type SalesSummaryDto = z.infer<typeof salesSummaryDtoSchema>;

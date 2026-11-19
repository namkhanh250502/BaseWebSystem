import { z } from 'zod';
import {
  booleanQuerySchema,
  dateOnlySchema,
  DOCUMENT_ITEM_LIMIT,
  DOCUMENT_STATUSES,
  documentVersionSchema,
  moneySchema,
  nullableText,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  quantitySchema,
  userRefSchema,
} from '../constants/commerce';
import { paginationQuerySchema, sortOrderSchema } from './common';

export const SALES_ORDER_SORT_FIELDS = ['orderDate', 'code', 'totalAmount', 'createdAt'] as const;

export const listSalesOrdersQuerySchema = paginationQuerySchema.extend({
  /** Tìm theo mã đơn hoặc SĐT khách */
  search: z.string().trim().max(64).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
  createdById: z.uuid().optional(),
  /** Chỉ đơn của tôi */
  mine: booleanQuerySchema,
  sortBy: z.enum(SALES_ORDER_SORT_FIELDS).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export const salesItemInputSchema = z.object({
  productId: z.uuid(),
  quantity: quantitySchema,
  /** Bỏ trống = giá niêm yết; khác giá niêm yết cần quyền sales.overridePrice */
  unitPrice: moneySchema.optional(),
  discountAmount: moneySchema.default('0'),
});

export const salesOrderInputSchema = z.object({
  /** Mặc định hôm nay (giờ Việt Nam) */
  orderDate: dateOnlySchema.optional(),
  customerName: nullableText(150),
  customerPhone: nullableText(30),
  paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
  discountAmount: moneySchema.default('0'),
  notes: nullableText(2000),
  items: z.array(salesItemInputSchema).min(1).max(DOCUMENT_ITEM_LIMIT),
});

export const createSalesOrderSchema = salesOrderInputSchema.extend({
  /** Do client sinh 1 lần cho mỗi giỏ hàng: gửi lại cùng id trả về đơn đã tạo (idempotent) */
  clientRequestId: z.uuid(),
  /** Tạo và chốt ngay trong một bước */
  confirm: z.boolean().default(false),
  /** Đánh dấu đã thanh toán khi chốt */
  markPaid: z.boolean().default(false),
});
export const updateSalesOrderSchema = salesOrderInputSchema.extend(documentVersionSchema.shape);

export const confirmSalesOrderSchema = documentVersionSchema.extend({
  markPaid: z.boolean().default(false),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
});

export const paySalesOrderSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
});

export const salesOrderDtoSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  orderDate: z.string(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  status: z.enum(DOCUMENT_STATUSES),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentStatus: z.enum(PAYMENT_STATUSES),
  paidAt: z.string().nullable(),
  itemCount: z.number().int(),
  subtotal: z.string(),
  discountAmount: z.string(),
  totalAmount: z.string(),
  /** Tổng giá vốn — chỉ khi có quyền products.viewCost và đơn đã chốt */
  totalCost: z.string().nullable().optional(),
  notes: z.string().nullable(),
  cancelReason: z.string().nullable(),
  version: z.number().int(),
  createdBy: userRefSchema.nullable(),
  confirmedBy: userRefSchema.nullable(),
  cancelledBy: userRefSchema.nullable(),
  paidBy: userRefSchema.nullable(),
  confirmedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const salesOrderItemDtoSchema = z.object({
  id: z.uuid(),
  lineNo: z.number().int(),
  productId: z.uuid(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  quantity: z.string(),
  listPrice: z.string(),
  unitPrice: z.string(),
  discountAmount: z.string(),
  lineAmount: z.string(),
  /** Có khi đơn đã chốt */
  allocatedOrderDiscount: z.string().nullable(),
  netAmount: z.string().nullable(),
  /** Chỉ khi có quyền products.viewCost */
  unitCost: z.string().nullable().optional(),
  costAmount: z.string().nullable().optional(),
});

export const salesOrderDetailDtoSchema = salesOrderDtoSchema.extend({
  items: z.array(salesOrderItemDtoSchema),
});

/** `details` của lỗi `sales.insufficientStock` / `inventory.negativeStock` */
export const stockShortageSchema = z.object({
  productId: z.uuid(),
  sku: z.string(),
  name: z.string(),
  requested: z.string(),
  available: z.string(),
});

export type ListSalesOrdersQuery = z.input<typeof listSalesOrdersQuerySchema>;
export type SalesOrderInput = z.input<typeof salesOrderInputSchema>;
export type CreateSalesOrderInput = z.input<typeof createSalesOrderSchema>;
export type UpdateSalesOrderInput = z.input<typeof updateSalesOrderSchema>;
export type ConfirmSalesOrderInput = z.input<typeof confirmSalesOrderSchema>;
export type PaySalesOrderInput = z.input<typeof paySalesOrderSchema>;
export type SalesOrderDto = z.infer<typeof salesOrderDtoSchema>;
export type SalesOrderItemDto = z.infer<typeof salesOrderItemDtoSchema>;
export type SalesOrderDetailDto = z.infer<typeof salesOrderDetailDtoSchema>;
export type StockShortage = z.infer<typeof stockShortageSchema>;

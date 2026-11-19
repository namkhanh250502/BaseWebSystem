import { z } from 'zod';
import {
  dateOnlySchema,
  DOCUMENT_ITEM_LIMIT,
  DOCUMENT_STATUSES,
  documentVersionSchema,
  moneySchema,
  nullableText,
  quantitySchema,
  userRefSchema,
} from '../constants/commerce';
import { paginationQuerySchema, sortOrderSchema } from './common';

export const PURCHASE_SORT_FIELDS = ['receiptDate', 'code', 'totalAmount', 'createdAt'] as const;

export const listPurchasesQuerySchema = paginationQuerySchema.extend({
  /** Tìm theo mã phiếu */
  search: z.string().trim().max(64).optional(),
  supplierId: z.uuid().optional(),
  productId: z.uuid().optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
  sortBy: z.enum(PURCHASE_SORT_FIELDS).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export const purchaseItemInputSchema = z.object({
  productId: z.uuid(),
  quantity: quantitySchema,
  unitPrice: moneySchema,
  discountAmount: moneySchema.default('0'),
});

export const purchaseInputSchema = z.object({
  supplierId: z.uuid(),
  receiptDate: dateOnlySchema,
  /** Chiết khấu cả phiếu, phân bổ vào giá vốn từng dòng khi xác nhận */
  discountAmount: moneySchema.default('0'),
  notes: nullableText(2000),
  items: z.array(purchaseItemInputSchema).min(1).max(DOCUMENT_ITEM_LIMIT),
});

export const createPurchaseSchema = purchaseInputSchema;
export const updatePurchaseSchema = purchaseInputSchema.extend(documentVersionSchema.shape);

const productRefSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
});

export const purchaseReceiptDtoSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  supplier: z.object({ id: z.uuid(), name: z.string() }),
  receiptDate: z.string(),
  status: z.enum(DOCUMENT_STATUSES),
  itemCount: z.number().int(),
  subtotal: z.string(),
  discountAmount: z.string(),
  totalAmount: z.string(),
  notes: z.string().nullable(),
  cancelReason: z.string().nullable(),
  version: z.number().int(),
  createdBy: userRefSchema.nullable(),
  confirmedBy: userRefSchema.nullable(),
  cancelledBy: userRefSchema.nullable(),
  confirmedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const purchaseReceiptItemDtoSchema = z.object({
  id: z.uuid(),
  lineNo: z.number().int(),
  product: productRefSchema,
  quantity: z.string(),
  unitPrice: z.string(),
  discountAmount: z.string(),
  lineAmount: z.string(),
  /** Giá vốn đơn vị sau phân bổ chiết khấu phiếu — có khi đã xác nhận */
  unitCost: z.string().nullable(),
});

export const purchaseReceiptDetailDtoSchema = purchaseReceiptDtoSchema.extend({
  items: z.array(purchaseReceiptItemDtoSchema),
});

export type ListPurchasesQuery = z.input<typeof listPurchasesQuerySchema>;
export type PurchaseInput = z.input<typeof purchaseInputSchema>;
export type UpdatePurchaseInput = z.input<typeof updatePurchaseSchema>;
export type PurchaseReceiptDto = z.infer<typeof purchaseReceiptDtoSchema>;
export type PurchaseReceiptItemDto = z.infer<typeof purchaseReceiptItemDtoSchema>;
export type PurchaseReceiptDetailDto = z.infer<typeof purchaseReceiptDetailDtoSchema>;

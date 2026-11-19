import { z } from 'zod';
import {
  ADJUSTMENT_REASONS,
  dateOnlySchema,
  DOCUMENT_ITEM_LIMIT,
  MOVEMENT_REF_TYPES,
  MOVEMENT_TYPES,
  nonNegativeQuantitySchema,
  nullableText,
  PRODUCT_STATUSES,
  signedQuantitySchema,
  STOCK_STATES,
  userRefSchema,
} from '../constants/commerce';
import { paginationQuerySchema, sortOrderSchema } from './common';

const productRefSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
});

// ----- Tồn hiện tại -----

export const INVENTORY_SORT_FIELDS = ['name', 'sku', 'quantity', 'value'] as const;

export const listInventoryQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(255).optional(),
  categoryId: z.uuid().optional(),
  stockState: z.enum(STOCK_STATES).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  sortBy: z.enum(INVENTORY_SORT_FIELDS).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const inventoryItemDtoSchema = z.object({
  productId: z.uuid(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  category: z.object({ id: z.uuid(), name: z.string() }),
  productStatus: z.enum(PRODUCT_STATUSES),
  quantity: z.string(),
  minStock: z.string(),
  state: z.enum(STOCK_STATES),
  /** Chỉ khi có quyền inventory.viewValue */
  avgCost: z.string().optional(),
  value: z.string().optional(),
  lastMovementAt: z.string().nullable(),
});

export const inventorySummarySchema = z.object({
  totalQuantity: z.string(),
  /** Chỉ khi có quyền inventory.viewValue */
  totalValue: z.string().optional(),
  lowCount: z.number().int(),
  outCount: z.number().int(),
});

// ----- Sổ biến động -----

export const listMovementsQuerySchema = paginationQuerySchema.extend({
  productId: z.uuid().optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  refType: z.enum(MOVEMENT_REF_TYPES).optional(),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
  /** Tìm theo mã chứng từ hoặc SKU */
  search: z.string().trim().max(64).optional(),
  sortOrder: sortOrderSchema,
});

export const inventoryMovementDtoSchema = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  product: productRefSchema,
  type: z.enum(MOVEMENT_TYPES),
  quantityChange: z.string(),
  quantityBefore: z.string(),
  quantityAfter: z.string(),
  /** Chỉ khi có quyền inventory.viewValue */
  unitCost: z.string().optional(),
  avgCostAfter: z.string().optional(),
  ref: z.object({ type: z.enum(MOVEMENT_REF_TYPES), id: z.uuid(), code: z.string() }),
  reason: z.enum(ADJUSTMENT_REASONS).nullable(),
  note: z.string().nullable(),
  createdBy: userRefSchema.nullable(),
});

// ----- Điều chỉnh tồn -----

export const adjustmentItemInputSchema = z.object({
  productId: z.uuid(),
  /** Chênh lệch (+ tăng, − giảm) — dùng với lý do khác STOCKTAKE */
  quantityChange: signedQuantitySchema.optional(),
  /** Số đếm thực tế — dùng với lý do STOCKTAKE, hệ thống tự tính chênh lệch */
  countedQuantity: nonNegativeQuantitySchema.optional(),
});

export const createAdjustmentSchema = z
  .object({
    /** Idempotency: gửi lại cùng id trả về phiếu đã tạo */
    clientRequestId: z.uuid(),
    reason: z.enum(ADJUSTMENT_REASONS),
    note: nullableText(1000),
    items: z.array(adjustmentItemInputSchema).min(1).max(DOCUMENT_ITEM_LIMIT),
  })
  .superRefine((input, ctx) => {
    if (input.reason === 'OTHER' && !input.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'inventory.noteRequired' });
    }
    const stocktake = input.reason === 'STOCKTAKE';
    input.items.forEach((item, index) => {
      const ok = stocktake
        ? item.countedQuantity !== undefined && item.quantityChange === undefined
        : item.quantityChange !== undefined && item.countedQuantity === undefined;
      if (!ok) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, stocktake ? 'countedQuantity' : 'quantityChange'],
          message: stocktake ? 'inventory.countedRequired' : 'inventory.changeRequired',
        });
      }
    });
    const ids = input.items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'inventory.duplicateProduct' });
    }
  });

export const listAdjustmentsQuerySchema = paginationQuerySchema.extend({
  reason: z.enum(ADJUSTMENT_REASONS).optional(),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
  /** Tìm theo mã phiếu */
  search: z.string().trim().max(64).optional(),
  sortOrder: sortOrderSchema,
});

export const inventoryAdjustmentDtoSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  reason: z.enum(ADJUSTMENT_REASONS),
  note: z.string().nullable(),
  itemCount: z.number().int(),
  createdBy: userRefSchema.nullable(),
  createdAt: z.string(),
});

export const inventoryAdjustmentDetailDtoSchema = inventoryAdjustmentDtoSchema.extend({
  items: z.array(
    z.object({
      id: z.uuid(),
      product: productRefSchema,
      quantityBefore: z.string(),
      quantityChange: z.string(),
      quantityAfter: z.string(),
      countedQuantity: z.string().nullable(),
      /** Chỉ khi có quyền inventory.viewValue */
      unitCost: z.string().optional(),
    }),
  ),
});

export type ListInventoryQuery = z.input<typeof listInventoryQuerySchema>;
export type InventoryItemDto = z.infer<typeof inventoryItemDtoSchema>;
export type InventorySummary = z.infer<typeof inventorySummarySchema>;
export type ListMovementsQuery = z.input<typeof listMovementsQuerySchema>;
export type InventoryMovementDto = z.infer<typeof inventoryMovementDtoSchema>;
export type CreateAdjustmentInput = z.input<typeof createAdjustmentSchema>;
export type ListAdjustmentsQuery = z.input<typeof listAdjustmentsQuerySchema>;
export type InventoryAdjustmentDto = z.infer<typeof inventoryAdjustmentDtoSchema>;
export type InventoryAdjustmentDetailDto = z.infer<typeof inventoryAdjustmentDetailDtoSchema>;

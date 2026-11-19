import { z } from 'zod';
import {
  IMAGE_MIME_TYPES,
  moneySchema,
  nonNegativeQuantitySchema,
  nullableText,
  PRODUCT_IMAGE_LIMIT,
  PRODUCT_STATUSES,
  STOCK_STATES,
} from '../constants/commerce';
import { paginationQuerySchema, sortOrderSchema } from './common';

export const PRODUCT_SORT_FIELDS = ['name', 'sku', 'sellingPrice', 'stock', 'createdAt'] as const;

export const listProductsQuerySchema = paginationQuerySchema.extend({
  /** Tìm theo tên hoặc SKU */
  search: z.string().trim().max(255).optional(),
  categoryId: z.uuid().optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  stockState: z.enum(STOCK_STATES).optional(),
  sortBy: z.enum(PRODUCT_SORT_FIELDS).default('createdAt'),
  sortOrder: sortOrderSchema,
});

/** Trường của sản phẩm (không default, xem category.ts). Không có trường tồn kho (FR-005). */
const productFields = {
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, { message: 'products.skuFormat' }),
  name: z.string().trim().min(1).max(255),
  description: nullableText(5000),
  categoryId: z.uuid(),
  unit: z.string().trim().min(1).max(30),
  allowDecimalQuantity: z.boolean(),
  /** Giá nhập tham khảo (điền sẵn phiếu nhập); giá vốn thực là bình quân gia quyền */
  purchasePrice: moneySchema,
  sellingPrice: moneySchema,
  minStock: nonNegativeQuantitySchema,
  status: z.enum(PRODUCT_STATUSES),
};

export const createProductSchema = z.object({
  ...productFields,
  allowDecimalQuantity: productFields.allowDecimalQuantity.default(false),
  purchasePrice: productFields.purchasePrice.default('0'),
  minStock: productFields.minStock.default('0'),
  status: productFields.status.default('ACTIVE'),
});
export const updateProductSchema = z.object(productFields).partial();

// ----- Ảnh -----

export const imageUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(IMAGE_MIME_TYPES, { message: 'productImages.invalidType' }),
  sizeBytes: z.number().int().positive(),
  /** Thay ảnh này bằng ảnh mới (giữ vị trí và cờ ảnh chính) */
  replaceImageId: z.uuid().optional(),
});

export const setPrimaryImageSchema = z.object({ isPrimary: z.literal(true) });

export const imageOrderSchema = z.object({
  imageIds: z.array(z.uuid()).min(1).max(PRODUCT_IMAGE_LIMIT),
});

export const imageUploadTicketSchema = z.object({
  imageId: z.uuid(),
  /** POST multipart tới `url` với toàn bộ `fields` + trường `file` (đặt cuối) */
  upload: z.object({ url: z.string(), fields: z.record(z.string(), z.string()) }),
  expiresAt: z.string(),
});

export const productImageDtoSchema = z.object({
  id: z.uuid(),
  /** URL xem ảnh có hạn; null khi kho lưu trữ không khả dụng */
  url: z.string().nullable(),
  expiresAt: z.string().nullable(),
  mimeType: z.enum(IMAGE_MIME_TYPES),
  sizeBytes: z.number().int(),
  originalName: z.string().nullable(),
  sortOrder: z.number().int(),
  isPrimary: z.boolean(),
});

// ----- DTO -----

export const productDtoSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  name: z.string(),
  category: z.object({ id: z.uuid(), name: z.string() }),
  unit: z.string(),
  allowDecimalQuantity: z.boolean(),
  sellingPrice: z.string(),
  /** Chỉ có khi có quyền products.viewCost */
  purchasePrice: z.string().optional(),
  /** Giá vốn bình quân hiện tại — chỉ có khi có quyền products.viewCost */
  avgCost: z.string().optional(),
  minStock: z.string(),
  status: z.enum(PRODUCT_STATUSES),
  hasTransactions: z.boolean(),
  stock: z.object({ quantity: z.string(), state: z.enum(STOCK_STATES) }),
  primaryImage: productImageDtoSchema.pick({ id: true, url: true, expiresAt: true }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const productDetailDtoSchema = productDtoSchema.extend({
  description: z.string().nullable(),
  images: z.array(productImageDtoSchema),
});

export type ListProductsQuery = z.input<typeof listProductsQuerySchema>;
export type CreateProductInput = z.input<typeof createProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type ImageUploadRequestInput = z.input<typeof imageUploadRequestSchema>;
export type ImageUploadTicket = z.infer<typeof imageUploadTicketSchema>;
export type ProductImageDto = z.infer<typeof productImageDtoSchema>;
export type ProductDto = z.infer<typeof productDtoSchema>;
export type ProductDetailDto = z.infer<typeof productDetailDtoSchema>;

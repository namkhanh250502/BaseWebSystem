import { z } from 'zod';
import { nullableText, RECORD_STATUSES } from '../constants/commerce';
import { paginationQuerySchema } from './common';

export const CATEGORY_SORT_FIELDS = ['name', 'createdAt'] as const;

export const listCategoriesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(150).optional(),
  status: z.enum(RECORD_STATUSES).optional(),
  sortBy: z.enum(CATEGORY_SORT_FIELDS).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

/** Trường của danh mục (không có default để `.partial()` khi sửa không ghi đè giá trị cũ) */
const categoryFields = {
  name: z.string().trim().min(1).max(150),
  description: nullableText(2000),
  status: z.enum(RECORD_STATUSES),
};

export const createCategorySchema = z.object({
  ...categoryFields,
  status: categoryFields.status.default('ACTIVE'),
});
export const updateCategorySchema = z.object(categoryFields).partial();

export const categoryDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(RECORD_STATUSES),
  productCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ListCategoriesQuery = z.input<typeof listCategoriesQuerySchema>;
export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
export type CategoryDto = z.infer<typeof categoryDtoSchema>;

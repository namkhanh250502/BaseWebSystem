import { z } from 'zod';
import { nullableText, RECORD_STATUSES } from '../constants/commerce';
import { paginationQuerySchema } from './common';

export const SUPPLIER_SORT_FIELDS = ['name', 'createdAt'] as const;

export const listSuppliersQuerySchema = paginationQuerySchema.extend({
  /** Tìm theo tên, người liên hệ, điện thoại, email */
  search: z.string().trim().max(255).optional(),
  status: z.enum(RECORD_STATUSES).optional(),
  sortBy: z.enum(SUPPLIER_SORT_FIELDS).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const supplierFields = {
  name: z.string().trim().min(1).max(255),
  contactPerson: nullableText(150),
  phone: nullableText(30),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.email().max(255).nullable().optional(),
  ),
  address: nullableText(1000),
  notes: nullableText(2000),
  status: z.enum(RECORD_STATUSES),
};

export const createSupplierSchema = z.object({
  ...supplierFields,
  status: supplierFields.status.default('ACTIVE'),
});
export const updateSupplierSchema = z.object(supplierFields).partial();

export const supplierDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  contactPerson: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(RECORD_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const supplierDetailDtoSchema = supplierDtoSchema.extend({
  /** Chỉ tính phiếu nhập đã xác nhận */
  purchaseSummary: z.object({
    receiptCount: z.number().int(),
    totalConfirmedAmount: z.string(),
    lastReceiptDate: z.string().nullable(),
  }),
});

export type ListSuppliersQuery = z.input<typeof listSuppliersQuerySchema>;
export type CreateSupplierInput = z.input<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.input<typeof updateSupplierSchema>;
export type SupplierDto = z.infer<typeof supplierDtoSchema>;
export type SupplierDetailDto = z.infer<typeof supplierDetailDtoSchema>;

import {
  ADJUSTMENT_REASONS,
  DOCUMENT_STATUSES,
  IMAGE_STATUSES,
  MOVEMENT_REF_TYPES,
  MOVEMENT_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PRODUCT_STATUSES,
  RECORD_STATUSES,
} from '@base/shared';
import { numeric, pgEnum } from 'drizzle-orm/pg-core';

// Enum PostgreSQL của nghiệp vụ bán hàng & tồn kho: giá trị lấy từ @base/shared (dùng chung FE/BE)
export const recordStatusEnum = pgEnum('record_status', RECORD_STATUSES);
export const productStatusEnum = pgEnum('product_status', PRODUCT_STATUSES);
export const documentStatusEnum = pgEnum('document_status', DOCUMENT_STATUSES);
export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
export const paymentStatusEnum = pgEnum('payment_status', PAYMENT_STATUSES);
export const adjustmentReasonEnum = pgEnum('adjustment_reason', ADJUSTMENT_REASONS);
export const movementTypeEnum = pgEnum('movement_type', MOVEMENT_TYPES);
export const movementRefTypeEnum = pgEnum('movement_ref_type', MOVEMENT_REF_TYPES);
export const imageStatusEnum = pgEnum('image_status', IMAGE_STATUSES);

/** Tiền: numeric(18,2) — Drizzle trả về chuỗi, không qua số thực JS */
export const money = () => numeric({ precision: 18, scale: 2 });
/** Giá vốn đơn vị / bình quân: numeric(18,4) */
export const cost = () => numeric({ precision: 18, scale: 4 });
/** Số lượng: numeric(14,3) (hàng cân đo được tối đa 3 chữ số lẻ) */
export const quantity = () => numeric({ precision: 14, scale: 3 });

import { z } from 'zod';

/*
 * Hằng số nghiệp vụ bán hàng & tồn kho. Giá trị là MÃ trung lập ngôn ngữ (lưu DB, trả API);
 * nhãn hiển thị dịch ở frontend theo `commerce:<nhóm>.<mã>` (constitution V).
 */

/** Trạng thái danh mục, nhà cung cấp */
export const RECORD_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

/** Trạng thái kinh doanh của sản phẩm */
export const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Trạng thái chứng từ (phiếu nhập, đơn bán) */
export const DOCUMENT_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Thanh toán toàn bộ một lần (spec Q2) */
export const PAYMENT_STATUSES = ['UNPAID', 'PAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ADJUSTMENT_REASONS = ['DAMAGED', 'LOST', 'STOCKTAKE', 'OTHER'] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const MOVEMENT_TYPES = [
  'PURCHASE_IN',
  'SALE_OUT',
  'SALE_CANCEL_IN',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_REF_TYPES = [
  'PURCHASE_RECEIPT',
  'SALES_ORDER',
  'INVENTORY_ADJUSTMENT',
] as const;
export type MovementRefType = (typeof MOVEMENT_REF_TYPES)[number];

export const IMAGE_STATUSES = ['PENDING', 'READY', 'DELETED'] as const;
export type ImageStatus = (typeof IMAGE_STATUSES)[number];

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

/** Trạng thái tồn (tính toán, không lưu): hết hàng / sắp hết (≤ tồn tối thiểu) / còn hàng */
export const STOCK_STATES = ['IN_STOCK', 'LOW', 'OUT'] as const;
export type StockState = (typeof STOCK_STATES)[number];

/** Tiền tố mã chứng từ: PN-20261119-0001 */
export const DOCUMENT_CODE_PREFIXES = {
  PURCHASE_RECEIPT: 'PN',
  SALES_ORDER: 'DH',
  INVENTORY_ADJUSTMENT: 'DC',
} as const;

/** Số ảnh tối đa mỗi sản phẩm */
export const PRODUCT_IMAGE_LIMIT = 10;
/** Số dòng tối đa mỗi chứng từ */
export const DOCUMENT_ITEM_LIMIT = 200;
/** Khoảng ngày tối đa của báo cáo */
export const REPORT_MAX_RANGE_DAYS = 366;
/** Múi giờ nghiệp vụ: "hôm nay", ngày chứng từ, nhóm theo ngày/tháng */
export const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const businessDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Ngày YYYY-MM-DD theo giờ Việt Nam của thời điểm cho trước (mặc định: bây giờ) */
export function businessDate(at: Date = new Date()): string {
  return businessDateFormat.format(at);
}

// ----- Kiểu số dạng chuỗi (giữ chính xác, không qua số thực JS — constitution VII) -----

const DECIMAL_RE = (scale: number) => new RegExp(`^\\d{1,15}(\\.\\d{1,${scale}})?$`);

/** Tiền ≥ 0, tối đa 2 chữ số lẻ, dạng chuỗi ("125000", "99.5"). Nhận cả số nguyên JSON. */
export const moneySchema = z
  .union([z.string().trim(), z.number().int().nonnegative()])
  .transform((v) => String(v))
  .pipe(z.string().regex(DECIMAL_RE(2), { message: 'commerce.invalidMoney' }));

/** Số lượng > 0, tối đa 3 chữ số lẻ, dạng chuỗi */
export const quantitySchema = z
  .union([z.string().trim(), z.number().int().positive()])
  .transform((v) => String(v))
  .pipe(
    z
      .string()
      .regex(DECIMAL_RE(3), { message: 'commerce.invalidQuantity' })
      .refine((v) => Number(v) > 0, { message: 'commerce.quantityPositive' }),
  );

/** Số lượng ≥ 0 (tồn tối thiểu, số đếm kiểm kê) */
export const nonNegativeQuantitySchema = z
  .union([z.string().trim(), z.number().int().nonnegative()])
  .transform((v) => String(v))
  .pipe(z.string().regex(DECIMAL_RE(3), { message: 'commerce.invalidQuantity' }));

/** Số lượng thay đổi khác 0, có dấu (điều chỉnh tồn) */
export const signedQuantitySchema = z
  .union([z.string().trim(), z.number().int()])
  .transform((v) => String(v))
  .pipe(
    z
      .string()
      .regex(/^-?\d{1,11}(\.\d{1,3})?$/, { message: 'commerce.invalidQuantity' })
      .refine((v) => Number(v) !== 0, { message: 'commerce.quantityNonZero' }),
  );

/** Ngày dạng YYYY-MM-DD (ngày chứng từ, khoảng báo cáo) */
export const dateOnlySchema = z.iso.date();

/** Tham chiếu gọn tới người dùng trong DTO chứng từ */
export const userRefSchema = z.object({ id: z.uuid(), name: z.string() });
export type UserRef = z.infer<typeof userRefSchema>;

/** Chuỗi tuỳ chọn có giới hạn độ dài; chuỗi rỗng được lưu là null */
export function nullableText(max: number) {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );
}

/** Query boolean dạng chuỗi 'true' | 'false' */
export const booleanQuerySchema = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** Body thao tác chứng từ có khoá lạc quan */
export const documentVersionSchema = z.object({ version: z.number().int().positive() });
export const cancelDocumentSchema = documentVersionSchema.extend({
  reason: nullableText(500),
});
export type DocumentVersionInput = z.infer<typeof documentVersionSchema>;
export type CancelDocumentInput = z.input<typeof cancelDocumentSchema>;

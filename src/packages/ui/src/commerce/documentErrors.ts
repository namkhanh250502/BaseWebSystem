import { ApiClientError } from '@base/api-client';

export type LineErrorKind =
  'insufficientStock' | 'negativeStock' | 'decimalNotAllowed' | 'inactive';

/** Lỗi gắn với từng sản phẩm trong chứng từ (thiếu hàng, số lẻ, ngừng kinh doanh) */
export interface LineError {
  /** Loại lỗi → bản dịch `commerce:lineError.<kind>` */
  kind: LineErrorKind;
  productId: string;
  sku: string;
  requested?: string;
  available?: string;
}

const LINE_ERROR_KINDS: Record<string, LineErrorKind> = {
  'sales.insufficientStock': 'insufficientStock',
  'inventory.negativeStock': 'negativeStock',
  'inventory.decimalNotAllowed': 'decimalNotAllowed',
  'products.inactive': 'inactive',
};

/**
 * Đọc `details` của lỗi nghiệp vụ theo dòng → Map productId → lỗi, để giao diện đánh dấu đúng
 * dòng giỏ hàng / phiếu. Rẽ nhánh theo `error.key` (không theo thông điệp đã dịch).
 */
export function lineErrorsOf(error: unknown): Map<string, LineError> {
  const result = new Map<string, LineError>();
  const kind =
    error instanceof ApiClientError && error.key ? LINE_ERROR_KINDS[error.key] : undefined;
  if (!kind || !(error instanceof ApiClientError) || !Array.isArray(error.details)) return result;
  for (const item of error.details as Partial<LineError>[]) {
    if (item?.productId && item.sku) {
      result.set(item.productId, {
        kind,
        productId: item.productId,
        sku: item.sku,
        requested: item.requested,
        available: item.available,
      });
    }
  }
  return result;
}

/** Chứng từ đã bị người khác sửa / xử lý → cần tải lại */
export function isStaleError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    Boolean(error.key && /\.(stale|alreadyProcessed|notDraft)$/.test(error.key))
  );
}

/** Mã lỗi nghiệp vụ (key i18n) của lỗi API */
export function apiErrorKey(error: unknown): string | undefined {
  return error instanceof ApiClientError ? error.key : undefined;
}

/** Sinh id idempotency cho một lần gửi (giỏ hàng, phiếu điều chỉnh) */
export function newRequestId(): string {
  return crypto.randomUUID();
}

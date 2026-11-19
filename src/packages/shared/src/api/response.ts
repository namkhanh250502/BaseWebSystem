/** Định dạng response chung cho mọi API: { data, error, meta } */

export interface ApiError {
  code: ErrorCode;
  /** Key i18n của lỗi (ví dụ 'auth.invalidCredentials'), dùng khi FE cần xử lý riêng */
  key?: string;
  /** Thông báo đã được dịch theo Accept-Language */
  message: string;
  /** Tham số của thông báo (vd. `{ sku, available }`), dùng khi FE tự dựng thông điệp theo `key` */
  params?: Record<string, string | number>;
  details?: unknown;
}

export interface ApiMeta {
  page?: number;
  pageSize?: number;
  total?: number;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  meta?: ApiMeta;
}

export interface Paginated<T> {
  items: T[];
  meta: Required<ApiMeta>;
}

/** Mã lỗi chuẩn (theo HTTP), chi tiết nằm ở `key` */
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

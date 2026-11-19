import { ERROR_CODES, type ErrorCode } from '@base/shared';
import type { TranslateParams } from './i18n';

/**
 * Lỗi nghiệp vụ có kiểm soát. `key` là key i18n, được dịch theo ngôn ngữ của request
 * khi chuyển thành response.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    public readonly key: string,
    public readonly params?: TranslateParams,
    public readonly details?: unknown,
  ) {
    super(key);
    this.name = 'AppError';
  }
}

export const badRequest = (key = 'errors.badRequest', params?: TranslateParams) =>
  new AppError(400, ERROR_CODES.BAD_REQUEST, key, params);

export const validationError = (details: unknown) =>
  new AppError(422, ERROR_CODES.VALIDATION_ERROR, 'errors.validation', undefined, details);

export const unauthorized = (key = 'errors.unauthorized', params?: TranslateParams) =>
  new AppError(401, ERROR_CODES.UNAUTHORIZED, key, params);

export const forbidden = (key = 'errors.forbidden', params?: TranslateParams) =>
  new AppError(403, ERROR_CODES.FORBIDDEN, key, params);

export const notFound = (key = 'errors.notFound', params?: TranslateParams) =>
  new AppError(404, ERROR_CODES.NOT_FOUND, key, params);

/** `details`: chi tiết có cấu trúc (vd. danh sách sản phẩm thiếu hàng) để frontend gắn lỗi đúng dòng */
export const conflict = (key = 'errors.conflict', params?: TranslateParams, details?: unknown) =>
  new AppError(409, ERROR_CODES.CONFLICT, key, params, details);

/** Dữ liệu đúng định dạng nhưng sai quy tắc nghiệp vụ (422 với key riêng, khác errors.validation) */
export const unprocessable = (key: string, params?: TranslateParams, details?: unknown) =>
  new AppError(422, ERROR_CODES.VALIDATION_ERROR, key, params, details);

export const serviceUnavailable = (key = 'errors.serviceUnavailable', params?: TranslateParams) =>
  new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, key, params);

export const payloadTooLarge = (key = 'errors.payloadTooLarge', params?: TranslateParams) =>
  new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, key, params);

export const tooManyRequests = (key = 'errors.tooManyRequests', params?: TranslateParams) =>
  new AppError(429, ERROR_CODES.TOO_MANY_REQUESTS, key, params);

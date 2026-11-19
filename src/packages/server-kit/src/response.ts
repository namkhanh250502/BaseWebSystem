import { ERROR_CODES, type ApiMeta, type ApiResponse, type Locale } from '@base/shared';
import { AppError } from './errors';
import type { Translator } from './i18n';
import { logger } from './logger';

/** Body thành công chuẩn: { data, error: null, meta? } */
export function successBody<T>(data: T, meta?: ApiMeta): ApiResponse<T> {
  return { data, error: null, ...(meta ? { meta } : {}) };
}

interface IssueDetail {
  path: string;
  message: string;
}

/** Chuyển mọi lỗi thành { status, body } chuẩn đã dịch; lỗi không lường trước bị ẩn chi tiết */
export function errorBody(
  error: unknown,
  t: Translator,
  locale: Locale,
): { status: number; body: ApiResponse<never> } {
  if (error instanceof AppError) {
    let details = error.details;
    if (Array.isArray(details)) {
      // Thông báo validation tự định nghĩa (vd 'password.needDigit') được dịch theo key 'validation.*'
      details = (details as IssueDetail[]).map((d) =>
        t.has(`validation.${d.message}`)
          ? { ...d, message: t(locale, `validation.${d.message}`) }
          : d,
      );
    }
    return {
      status: error.status,
      body: {
        data: null,
        error: {
          code: error.code,
          key: error.key,
          message: t(locale, error.key, error.params),
          ...(details !== undefined ? { details } : {}),
        },
      },
    };
  }

  logger.error('Unhandled error', error);
  return {
    status: 500,
    body: {
      data: null,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        key: 'errors.internal',
        message: t(locale, 'errors.internal'),
      },
    },
  };
}

import { ApiClientError } from '@base/api-client';
import { fullName, PASSWORD_MIN_LENGTH, type Locale, type UserDto } from '@base/shared';
import type { FormRule } from 'antd';
import dayjs from 'dayjs';
import type { TFunction } from 'i18next';

/** Thông báo lỗi để hiển thị (server đã dịch sẵn theo ngôn ngữ hiện tại) */
export function getErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiClientError) {
    return error.isConnectivity ? t('common:networkError') : error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return t('common:error');
}

/** true khi lỗi do không kết nối được backend (mất mạng, server down, gateway 5xx) */
export function isConnectivityError(error: unknown): boolean {
  return error instanceof ApiClientError && error.isConnectivity;
}

export function errorKey(error: unknown): string | undefined {
  return error instanceof ApiClientError ? error.key : undefined;
}

export function formatDateTime(value: string | null | undefined, withTime = true): string {
  if (!value) return '—';
  return dayjs(value).format(withTime ? 'DD/MM/YYYY HH:mm' : 'DD/MM/YYYY');
}

export function fromNow(value: string): string {
  return dayjs(value).fromNow();
}

/** Ngôn ngữ dùng để sắp thứ tự họ tên; AppProviders cập nhật khi đổi ngôn ngữ */
let nameLocale: Locale = 'vi';
export function setNameLocale(locale: Locale) {
  nameLocale = locale;
}

export function displayName(user: Pick<UserDto, 'firstName' | 'lastName' | 'email'>): string {
  return fullName(user, nameLocale) || user.email;
}

/** Rule antd cho mật khẩu mới, khớp chính sách phía server */
export function passwordRules(t: TFunction): FormRule[] {
  return [
    { required: true, message: t('auth:validation.passwordRequired') },
    {
      min: PASSWORD_MIN_LENGTH,
      message: t('auth:validation.passwordMin', { min: PASSWORD_MIN_LENGTH }),
    },
    { pattern: /\d/, message: t('auth:validation.passwordDigit') },
  ];
}

/** Rule "nhập lại mật khẩu" phải khớp với field `field` */
export function confirmPasswordRules(t: TFunction, field: string): FormRule[] {
  return [
    { required: true, message: t('auth:validation.passwordRequired') },
    ({ getFieldValue }) => ({
      validator: (_, value) =>
        !value || getFieldValue(field) === value
          ? Promise.resolve()
          : Promise.reject(new Error(t('auth:validation.passwordMismatch'))),
    }),
  ];
}

export function emailRules(t: TFunction): FormRule[] {
  return [
    { required: true, message: t('auth:validation.emailRequired') },
    { type: 'email', message: t('auth:validation.emailInvalid') },
  ];
}

export function downloadFile(content: string, fileName: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Màu nền ổn định theo chuỗi (dùng cho avatar chữ cái) */
export function colorFromString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = value.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360} 55% 48%)`;
}

/** Ghép className, bỏ qua giá trị falsy */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

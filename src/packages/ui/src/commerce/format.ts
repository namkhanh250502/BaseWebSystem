import type { Locale } from '@base/shared';

/*
 * Định dạng hiển thị tiền / số lượng theo ngôn ngữ đang chọn. Chỉ để HIỂN THỊ: Intl nhận chuỗi
 * thập phân trực tiếp (không đi qua phép tính số thực). Tiền tệ luôn là VND (constitution V).
 */

const moneyFormats = new Map<string, Intl.NumberFormat>();
const quantityFormats = new Map<string, Intl.NumberFormat>();

function intlLocale(locale: Locale | string): string {
  return locale.startsWith('en') ? 'en-US' : 'vi-VN';
}

type Numeric = string | number | null | undefined;

function asNumeric(value: Numeric): Intl.StringNumericLiteral | number {
  if (value === null || value === undefined || value === '') return 0;
  return typeof value === 'number' ? value : (value as Intl.StringNumericLiteral);
}

/** 1.250.000 ₫ (vi) / ₫1,250,000 (en) */
export function formatMoney(value: Numeric, locale: Locale | string): string {
  const key = intlLocale(locale);
  let format = moneyFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(key, {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    });
    moneyFormats.set(key, format);
  }
  return format.format(asNumeric(value));
}

/** Số lượng tối đa 3 chữ số lẻ, bỏ số 0 thừa: 3 / 1,255 */
export function formatQuantity(value: Numeric, locale: Locale | string): string {
  const key = intlLocale(locale);
  let format = quantityFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(key, { maximumFractionDigits: 3 });
    quantityFormats.set(key, format);
  }
  return format.format(asNumeric(value));
}

/** Phần trăm (chuỗi số đã làm tròn từ server) */
export function formatPercent(value: string | null | undefined, locale: Locale | string): string {
  if (value === null || value === undefined) return '—';
  return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(
    value as Intl.StringNumericLiteral,
  )}%`;
}

/** Tách nghìn cho ô nhập tiền (InputNumber formatter / parser) */
export const moneyInputFormatter = (value: string | number | undefined) =>
  value === undefined || value === '' ? '' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const moneyInputParser = (value: string | undefined) => (value ?? '').replace(/,/g, '');

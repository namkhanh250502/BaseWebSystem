export const LOCALES = ['vi', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'vi';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Chuẩn hoá chuỗi ngôn ngữ bất kỳ ('vi-VN', 'en_US', 'en'...) về Locale được hỗ trợ */
export function normalizeLocale(value: string | null | undefined): Locale {
  const short = value?.trim().slice(0, 2).toLowerCase();
  return isLocale(short) ? short : DEFAULT_LOCALE;
}

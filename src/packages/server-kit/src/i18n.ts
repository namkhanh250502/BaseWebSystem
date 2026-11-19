import { DEFAULT_LOCALE, normalizeLocale, type Locale } from '@base/shared';
import type { RequestLike } from './request';

export interface Messages {
  [key: string]: string | Messages;
}

export type TranslateParams = Record<string, string | number>;

export interface Translator {
  (locale: Locale, key: string, params?: TranslateParams): string;
  has: (key: string) => boolean;
}

function lookup(messages: Messages | undefined, key: string): string | undefined {
  let node: string | Messages | undefined = messages;
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, params?: TranslateParams) {
  if (!params) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Tạo hàm dịch từ catalog { vi: {...}, en: {...} }; thiếu key thì fallback về ngôn ngữ mặc định rồi về chính key */
export function createTranslator(catalogs: Record<Locale, Messages>): Translator {
  const t = ((locale, key, params) => {
    const template = lookup(catalogs[locale], key) ?? lookup(catalogs[DEFAULT_LOCALE], key) ?? key;
    return interpolate(template, params);
  }) as Translator;
  t.has = (key) => lookup(catalogs[DEFAULT_LOCALE], key) !== undefined;
  return t;
}

/** Ngôn ngữ của request: header `x-lang` (FE gửi) rồi tới `Accept-Language` */
export function resolveLocale(req: RequestLike): Locale {
  return normalizeLocale(req.headers.get('x-lang') ?? req.headers.get('accept-language'));
}

import { DEFAULT_LOCALE, LOCALES, type Locale } from '@base/shared';
import i18next, { type Resource, type ResourceLanguage } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { vi } from './locales/vi';

export type AppResources = Record<Locale, ResourceLanguage>;

/**
 * Khởi tạo i18next cho 1 app. Bản dịch dùng chung (common, auth, account, notifications) được gộp
 * với bản dịch riêng của app. Ngôn ngữ được nhớ trong localStorage theo `storageKey`.
 */
export function createI18n(appResources: AppResources, storageKey: string) {
  const resources: Resource = {
    vi: { ...vi, ...appResources.vi },
    en: { ...en, ...appResources.en },
  };
  const instance = i18next.createInstance();
  void instance
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      supportedLngs: [...LOCALES],
      nonExplicitSupportedLngs: true,
      load: 'languageOnly',
      fallbackLng: DEFAULT_LOCALE,
      defaultNS: 'common',
      ns: Object.keys(resources.vi!),
      interpolation: { escapeValue: false },
      detection: {
        order: ['querystring', 'localStorage', 'navigator'],
        lookupQuerystring: 'lang',
        lookupLocalStorage: storageKey,
        caches: ['localStorage'],
      },
      react: { useSuspense: false },
    });
  instance.on('languageChanged', (lng) => {
    document.documentElement.lang = lng;
  });
  return instance;
}

/** Ngôn ngữ hiện tại, chuẩn hoá về 'vi' | 'en' */
export function currentLocale(language: string | undefined): Locale {
  const short = language?.slice(0, 2);
  return (LOCALES as readonly string[]).includes(short ?? '') ? (short as Locale) : DEFAULT_LOCALE;
}

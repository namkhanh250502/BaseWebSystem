import { createApi } from '@base/api-client';
import { notifySessionExpired } from '@base/ui';
import { i18n } from './i18n';

export const api = createApi({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  app: 'admin',
  getLocale: () => i18n.language,
  onSessionExpired: notifySessionExpired,
});

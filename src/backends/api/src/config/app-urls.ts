import type { AppName } from '@base/shared';
import { getEnv } from './env';

/** URL gốc của từng app (không có `/` cuối) */
export function appBaseUrl(app: AppName): string {
  const env = getEnv();
  return (app === 'admin' ? env.ADMIN_APP_URL : env.USER_APP_URL).replace(/\/$/, '');
}

/** Đường dẫn chứa cookie state và callback của Google OAuth */
export const GOOGLE_OAUTH_PATH = '/api/v1/auth/google';

/** Callback đi qua reverse proxy / dev proxy của chính app nên cookie cùng origin với app */
export function googleRedirectUri(app: AppName): string {
  return `${appBaseUrl(app)}${GOOGLE_OAUTH_PATH}/callback`;
}

import type { Api } from '@base/api-client';
import { createContext, useContext } from 'react';

export const ApiContext = createContext<Api | null>(null);

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi phải được dùng bên trong <AppProviders>');
  return api;
}

/** Event phát ra khi refresh token hết hạn hẳn; AuthProvider lắng nghe để đăng xuất */
export const SESSION_EXPIRED_EVENT = 'base:session-expired';

export function notifySessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

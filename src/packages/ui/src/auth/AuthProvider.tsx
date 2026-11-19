import type { AuthSession, MeDto } from '@base/shared';
import { useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { currentLocale } from '../i18n/createI18n';
import { SESSION_EXPIRED_EVENT, useApi } from '../providers/ApiContext';
import { AuthContext, type AuthContextValue, type AuthStatus } from './context';

export interface AuthProviderProps {
  children: ReactNode;
  /** App admin: chỉ chấp nhận tài khoản có quyền admin.access */
  requireAdmin?: boolean;
}

export function AuthProvider({ children, requireAdmin = false }: AuthProviderProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { i18n, t } = useTranslation();
  const { message } = App.useApp();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUserState] = useState<MeDto | null>(null);
  // Giá trị status mới nhất cho các listener sự kiện (cập nhật sau mỗi lần render)
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const isAllowed = useCallback(
    (me: MeDto) => !requireAdmin || me.permissions.includes('admin.access'),
    [requireAdmin],
  );

  const clearSession = useCallback(() => {
    api.http.setAccessToken(null);
    setUserState(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [api, queryClient]);

  /** Lưu ngôn ngữ đang dùng vào tài khoản (dùng cho email, thông báo hệ thống) */
  const syncLanguage = useCallback(
    (me: MeDto) => {
      const lang = currentLocale(i18n.language);
      if (me.lang === lang) return;
      api.me
        .updateProfile({ lang })
        .then(setUserState)
        .catch(() => undefined);
    },
    [api, i18n],
  );

  // Mở app: khôi phục phiên từ cookie refresh
  useEffect(() => {
    let cancelled = false;
    api.auth
      .refresh()
      .then((session) => {
        if (cancelled) return;
        if (!isAllowed(session.user)) {
          void api.auth.logout();
          return clearSession();
        }
        setUserState(session.user);
        setStatus('authenticated');
      })
      .catch(() => !cancelled && clearSession());
    return () => {
      cancelled = true;
    };
  }, [api, isAllowed, clearSession]);

  // Refresh token hết hạn hẳn trong lúc dùng app
  useEffect(() => {
    const onExpired = () => {
      if (statusRef.current !== 'authenticated') return;
      clearSession();
      void message.warning(t('common:sessionExpired'));
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [clearSession, message, t]);

  // Đổi ngôn ngữ khi đang đăng nhập → lưu vào tài khoản
  useEffect(() => {
    const onChange = () => {
      if (statusRef.current === 'authenticated' && user) syncLanguage(user);
    };
    i18n.on('languageChanged', onChange);
    return () => i18n.off('languageChanged', onChange);
  }, [i18n, user, syncLanguage]);

  const completeLogin = useCallback(
    (session: AuthSession) => {
      api.http.setAccessToken(session.accessToken);
      setUserState(session.user);
      setStatus('authenticated');
      syncLanguage(session.user);
    },
    [api, syncLanguage],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      clearSession();
    }
  }, [api, clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      can: (permission) => Boolean(user?.permissions.includes(permission)),
      completeLogin,
      setUser: setUserState,
      logout,
    }),
    [status, user, completeLogin, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

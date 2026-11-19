import type { Api } from '@base/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider, type ThemeConfig } from 'antd';
import enUS from 'antd/locale/en_US';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { i18n as I18n } from 'i18next';
import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { AuthProvider } from '../auth/AuthProvider';
import { currentLocale } from '../i18n/createI18n';
import { setNameLocale } from '../utils';
import { ApiContext } from './ApiContext';
import { baseTheme } from './theme';

dayjs.extend(relativeTime);

/** antd và dayjs đổi locale theo ngôn ngữ của i18next */
function LocalizedConfig({ children, theme }: { children: ReactNode; theme: ThemeConfig }) {
  const { i18n } = useTranslation();
  const locale = currentLocale(i18n.language);
  // Đặt ngay trong lúc render để các component con hiển thị tên đúng thứ tự ngay lần đầu
  setNameLocale(locale);
  useEffect(() => {
    dayjs.locale(locale);
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <ConfigProvider locale={locale === 'vi' ? viVN : enUS} theme={theme}>
      {/* Chặn trên số toast hiển thị cùng lúc, phòng khi có chỗ chưa gộp theo key */}
      <AntdApp message={{ maxCount: 3 }} notification={{ maxCount: 3 }}>
        {children}
      </AntdApp>
    </ConfigProvider>
  );
}

export interface AppProvidersProps {
  api: Api;
  i18n: I18n;
  children: ReactNode;
  requireAdmin?: boolean;
  theme?: ThemeConfig;
}

export function AppProviders({
  api,
  i18n,
  children,
  requireAdmin,
  theme = baseTheme,
}: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30_000 } },
      }),
  );
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <LocalizedConfig theme={theme}>
          <ApiContext value={api}>
            <AuthProvider requireAdmin={requireAdmin}>{children}</AuthProvider>
          </ApiContext>
        </LocalizedConfig>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

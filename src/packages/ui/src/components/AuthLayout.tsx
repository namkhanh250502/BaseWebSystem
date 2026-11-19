import { Typography } from 'antd';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';

export interface AuthLayoutProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Tên hệ thống hiển thị ở panel bên trái */
  brand?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Layout chia đôi cho các trang đăng nhập / đăng ký: panel thương hiệu bên trái, form bên phải */
export function AuthLayout({ title, subtitle, brand, children, footer }: AuthLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className="b-auth">
      <aside className="b-auth__brand">
        <div className="b-auth__logo">{brand ?? t('common:appName')}</div>
        <div>
          <h1 className="b-auth__brand-title">{t('auth:brandTitle')}</h1>
          <p className="b-auth__brand-subtitle">{t('auth:brandSubtitle')}</p>
        </div>
        <div className="b-auth__copyright">
          © {new Date().getFullYear()} {brand ?? t('common:appName')}
        </div>
      </aside>
      <main className="b-auth__main">
        <div className="b-auth__lang">
          <LanguageSwitcher showLabel />
        </div>
        <div className="b-auth__form">
          <Typography.Title level={2} className="b-auth__title">
            {title}
          </Typography.Title>
          {subtitle && <Typography.Paragraph type="secondary">{subtitle}</Typography.Paragraph>}
          {children}
          {footer && <div className="b-auth__footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

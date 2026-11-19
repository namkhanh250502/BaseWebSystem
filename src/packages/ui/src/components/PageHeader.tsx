import { Typography } from 'antd';
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Số lượng hiển thị cạnh tiêu đề (ví dụ tổng số bản ghi) */
  count?: number;
  actions?: ReactNode;
}

export function PageHeader({ icon, title, subtitle, count, actions }: PageHeaderProps) {
  return (
    <div className="b-page-header">
      <div className="b-page-header__main">
        {icon && <div className="b-page-header__icon">{icon}</div>}
        <div className="b-page-header__text">
          <div className="b-page-header__title-row">
            <Typography.Title level={1} className="b-page-header__title">
              {title}
            </Typography.Title>
            {count !== undefined && <span className="b-page-header__count">{count}</span>}
          </div>
          {subtitle && <span className="b-page-header__subtitle">{subtitle}</span>}
        </div>
      </div>
      {actions && <div className="b-page-header__actions">{actions}</div>}
    </div>
  );
}

/** Khối cài đặt 2 cột: tiêu đề + mô tả bên trái, nội dung bên phải */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="b-settings-section">
      <div className="b-settings-section__intro">
        <Typography.Title level={5} className="b-settings-section__title">
          {title}
        </Typography.Title>
        {description && <Typography.Text type="secondary">{description}</Typography.Text>}
      </div>
      <div className="b-settings-section__card">{children}</div>
    </section>
  );
}

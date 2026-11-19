import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Dropdown, Tooltip, Typography, type MenuProps } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/context';
import { useIsMobile } from '../hooks';
import { cx, displayName } from '../utils';
import { LanguageSwitcher } from './LanguageSwitcher';
import { UserAvatar } from './UserAvatar';

export type NavItem = {
  /** Đường dẫn, cũng là key của menu */
  key: string;
  icon?: ReactNode;
  label: ReactNode;
  hidden?: boolean;
};

export type NavGroup = { key: string; label?: ReactNode; items: NavItem[] };

export interface AppShellProps {
  /** Tên hệ thống: hiện dạng chữ khi không có logo, và làm alt cho ảnh logo */
  brand: ReactNode;
  brandCollapsed?: ReactNode;
  /** URL ảnh logo đầy đủ (khi sidebar mở rộng) */
  logo?: string;
  /** URL ảnh logo thu nhỏ (khi sidebar thu gọn) */
  logoCollapsed?: string;
  nav: NavGroup[];
  /**
   * Gắn class `b-sider--admin` / `b-sider--user` để app tuỳ biến thêm nếu cần;
   * mặc định cả hai dùng chung giao diện GPMPay.
   */
  variant?: 'admin' | 'user';
  /** Nút bổ sung trên header (ví dụ chuông thông báo) */
  headerExtra?: ReactNode;
  profilePath?: string;
}

const COLLAPSED_KEY = 'base.sidebar.collapsed';

function isActive(pathname: string, key: string) {
  return key === '/' ? pathname === '/' : pathname === key || pathname.startsWith(`${key}/`);
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function SiderBrand({
  brand,
  brandCollapsed,
  logo,
  logoCollapsed,
  collapsed,
}: Pick<AppShellProps, 'brand' | 'brandCollapsed' | 'logo' | 'logoCollapsed'> & { collapsed: boolean }) {
  const alt = typeof brand === 'string' ? brand : '';
  if (collapsed) {
    return logoCollapsed ? (
      <img className="b-sider__logo b-sider__logo--mini" src={logoCollapsed} alt={alt} />
    ) : (
      <>{brandCollapsed ?? brand}</>
    );
  }
  return logo ? <img className="b-sider__logo" src={logo} alt={alt} /> : <>{brand}</>;
}

function Sidebar({
  brand,
  brandCollapsed,
  logo,
  logoCollapsed,
  groups,
  variant,
  collapsed,
  showBrand,
  onNavigate,
}: {
  brand: ReactNode;
  brandCollapsed?: ReactNode;
  logo?: string;
  logoCollapsed?: string;
  groups: NavGroup[];
  variant: 'admin' | 'user';
  collapsed: boolean;
  showBrand: boolean;
  onNavigate: (path: string) => void;
}) {
  const { pathname } = useLocation();
  // Mục khớp dài nhất được coi là đang chọn (tránh '/' khớp mọi trang)
  const activeKey = groups
    .flatMap((g) => g.items.map((i) => i.key))
    .filter((k) => isActive(pathname, k))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside className={cx('b-sider', `b-sider--${variant}`, collapsed && 'b-sider--collapsed')}>
      {showBrand && (
        <div className="b-sider__brand">
          <SiderBrand
            brand={brand}
            brandCollapsed={brandCollapsed}
            logo={logo}
            logoCollapsed={logoCollapsed}
            collapsed={collapsed}
          />
        </div>
      )}
      <nav className="b-sider__nav">
        {groups.map((group, index) => (
          <div key={group.key} className={cx('b-nav-group', index > 0 && 'b-nav-group--next')}>
            {group.label && !collapsed && <div className="b-nav-group__title">{group.label}</div>}
            <div className="b-nav-group__items">
              {group.items.map((item) => {
                const button = (
                  <button
                    key={item.key}
                    type="button"
                    className={cx('b-nav-item', item.key === activeKey && 'b-nav-item--active')}
                    onClick={() => onNavigate(item.key)}
                    aria-current={item.key === activeKey ? 'page' : undefined}
                  >
                    {item.icon && <span className="b-nav-item__icon">{item.icon}</span>}
                    {!collapsed && <span className="b-nav-item__label">{item.label}</span>}
                  </button>
                );
                return collapsed ? (
                  <Tooltip key={item.key} title={item.label} placement="right">
                    {button}
                  </Tooltip>
                ) : (
                  button
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function AppShell({
  brand,
  brandCollapsed,
  logo,
  logoCollapsed,
  nav,
  variant = 'admin',
  headerExtra,
  profilePath = '/profile',
}: AppShellProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () =>
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1');
      } catch {
        // Bỏ qua: chỉ là ghi nhớ giao diện
      }
      return !value;
    });

  const groups = nav
    .map((group) => ({ ...group, items: group.items.filter((i) => !i.hidden) }))
    .filter((group) => group.items.length);

  const userMenu: MenuProps = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: t('common:profile') },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: t('common:logout'), danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'profile') navigate(profilePath);
      if (key === 'logout') void logout().then(() => navigate('/login'));
    },
  };

  const sidebarProps = {
    brand,
    brandCollapsed,
    logo,
    logoCollapsed,
    groups,
    variant,
    onNavigate: (path: string) => {
      navigate(path);
      // Trên mobile: chọn mục menu thì đóng drawer
      setMobileOpen(false);
    },
  };

  return (
    <div className="b-shell">
      {isMobile ? (
        <>
          <div
            className={cx('b-shell__overlay', mobileOpen && 'b-shell__overlay--open')}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className={cx('b-shell__drawer', mobileOpen && 'b-shell__drawer--open')}>
            <Sidebar {...sidebarProps} collapsed={false} showBrand />
          </div>
        </>
      ) : (
        <div className={cx('b-shell__sider-wrap', collapsed && 'b-shell__sider-wrap--collapsed')}>
          <Sidebar {...sidebarProps} collapsed={collapsed} showBrand />
        </div>
      )}

      <div className="b-shell__body">
        <header className="b-shell__header">
          <button
            type="button"
            className="b-icon-btn"
            aria-label="menu"
            onClick={() => (isMobile ? setMobileOpen(true) : toggleCollapsed())}
          >
            {isMobile ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
          <div className="b-shell__header-right">
            {headerExtra}
            <LanguageSwitcher />
            {user && <span className="b-shell__divider" aria-hidden="true" />}
            {user && (
              <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
                <button type="button" className="b-shell__user">
                  <UserAvatar user={user} size={30} />
                  {!isMobile && (
                    <Typography.Text strong ellipsis className="b-shell__user-name">
                      {displayName(user)}
                    </Typography.Text>
                  )}
                </button>
              </Dropdown>
            )}
          </div>
        </header>
        <main className="b-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

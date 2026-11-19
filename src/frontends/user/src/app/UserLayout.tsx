import {
  HistoryOutlined,
  HomeOutlined,
  ShoppingCartOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { AppShell, NotificationBell, useAuth, type NavGroup } from '@base/ui';
import { useTranslation } from 'react-i18next';
import { usePublicSettings } from '@/lib/usePublicSettings';
import logo from '@/assets/logo.svg';
import logoMini from '@/assets/logo-mini.svg';

export function UserLayout() {
  const { t } = useTranslation('menu');
  const settings = usePublicSettings();
  const { can } = useAuth();
  const siteName = settings.data?.site_name || t('common:appName');

  const nav: NavGroup[] = [
    {
      key: 'main',
      items: [
        { key: '/', icon: <HomeOutlined />, label: t('home') },
        { key: '/profile', icon: <UserOutlined />, label: t('profile') },
      ],
    },
    {
      key: 'sales',
      label: t('groupSales'),
      items: [
        {
          key: '/pos',
          icon: <ShoppingCartOutlined />,
          label: t('pos'),
          hidden: !can('sales.create'),
        },
        {
          key: '/sales',
          icon: <HistoryOutlined />,
          label: t('salesHistory'),
          hidden: !can('sales.list'),
        },
      ],
    },
  ];

  return (
    <AppShell
      brand={siteName}
      brandCollapsed={siteName.charAt(0)}
      logo={logo}
      logoCollapsed={logoMini}
      nav={nav}
      variant="user"
      headerExtra={<NotificationBell />}
    />
  );
}

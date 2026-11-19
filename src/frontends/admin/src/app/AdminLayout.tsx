import {
  AppstoreOutlined,
  BarChartOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  InboxOutlined,
  KeyOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { PermissionKey } from '@base/shared';
import { AppShell, NotificationBell, useAuth, type NavGroup } from '@base/ui';
import { useTranslation } from 'react-i18next';
import logo from '@/assets/logo.svg';
import logoMini from '@/assets/logo-mini.svg';

const REPORT_PERMISSIONS: PermissionKey[] = [
  'reports.sales',
  'reports.profit',
  'reports.purchases',
  'reports.inventory',
];

export function AdminLayout() {
  const { t } = useTranslation('menu');
  const { can } = useAuth();

  const nav: NavGroup[] = [
    {
      key: 'main',
      items: [{ key: '/', icon: <DashboardOutlined />, label: t('dashboard') }],
    },
    {
      key: 'catalog',
      label: t('groupCatalog'),
      items: [
        {
          key: '/products',
          icon: <ShoppingOutlined />,
          label: t('products'),
          hidden: !can('products.list'),
        },
        {
          key: '/categories',
          icon: <AppstoreOutlined />,
          label: t('categories'),
          hidden: !can('categories.list'),
        },
      ],
    },
    {
      key: 'trade',
      label: t('groupTrade'),
      items: [
        {
          key: '/suppliers',
          icon: <ShopOutlined />,
          label: t('suppliers'),
          hidden: !can('suppliers.list'),
        },
        {
          key: '/purchases',
          icon: <InboxOutlined />,
          label: t('purchases'),
          hidden: !can('purchases.list'),
        },
        {
          key: '/sales-orders',
          icon: <ShoppingCartOutlined />,
          label: t('salesOrders'),
          hidden: !can('sales.list'),
        },
        {
          key: '/inventory',
          icon: <DatabaseOutlined />,
          label: t('inventory'),
          hidden: !can('inventory.list'),
        },
        {
          key: '/reports',
          icon: <BarChartOutlined />,
          label: t('reports'),
          hidden: !REPORT_PERMISSIONS.some(can),
        },
      ],
    },
    {
      key: 'admin',
      label: t('groupAdmin'),
      items: [
        { key: '/users', icon: <TeamOutlined />, label: t('users'), hidden: !can('users.list') },
        {
          key: '/roles',
          icon: <SafetyCertificateOutlined />,
          label: t('roles'),
          hidden: !can('roles.list'),
        },
        {
          key: '/permissions',
          icon: <KeyOutlined />,
          label: t('permissions'),
          hidden: !can('permissions.list'),
        },
      ],
    },
    {
      key: 'system',
      label: t('groupSystem'),
      items: [
        {
          key: '/settings',
          icon: <SettingOutlined />,
          label: t('settings'),
          hidden: !can('settings.list'),
        },
      ],
    },
  ];

  return (
    <AppShell
      brand={t('brand')}
      brandCollapsed="BA"
      logo={logo}
      logoCollapsed={logoMini}
      nav={nav}
      variant="admin"
      headerExtra={<NotificationBell />}
    />
  );
}

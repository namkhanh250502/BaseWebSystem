import {
  DashboardOutlined,
  KeyOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { AppShell, NotificationBell, useAuth, type NavGroup } from '@base/ui';
import { useTranslation } from 'react-i18next';
import logo from '@/assets/logo.svg';
import logoMini from '@/assets/logo-mini.svg';

export function AdminLayout() {
  const { t } = useTranslation('menu');
  const { can } = useAuth();

  const nav: NavGroup[] = [
    {
      key: 'main',
      items: [{ key: '/', icon: <DashboardOutlined />, label: t('dashboard') }],
    },
    {
      key: 'admin',
      label: t('groupAdmin'),
      items: [
        { key: '/users', icon: <TeamOutlined />, label: t('users'), hidden: !can('users.list') },
        { key: '/roles', icon: <SafetyCertificateOutlined />, label: t('roles'), hidden: !can('roles.list') },
        { key: '/permissions', icon: <KeyOutlined />, label: t('permissions'), hidden: !can('permissions.list') },
      ],
    },
    {
      key: 'system',
      label: t('groupSystem'),
      items: [
        { key: '/settings', icon: <SettingOutlined />, label: t('settings'), hidden: !can('settings.list') },
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

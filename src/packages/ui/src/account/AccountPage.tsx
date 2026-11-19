import { HistoryOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { Card, Tabs, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { PageHeader, SettingsSection } from '../components/PageHeader';
import { useApi } from '../providers/ApiContext';
import { ChangePasswordForm } from './ChangePasswordForm';
import { LoginHistoryTable } from './LoginHistoryTable';
import { ProfileInfoForm } from './ProfileInfoForm';
import { TwoFactorSettings } from './TwoFactorSettings';

const TABS = ['info', 'security', 'loginHistory'] as const;
const LOGIN_HISTORY_KEY = ['me', 'login-history'] as const;
type Tab = (typeof TABS)[number];

/** Trang tài khoản (/profile): thông tin cá nhân, bảo mật, lịch sử đăng nhập; đồng bộ với ?tab= */
export function AccountPage() {
  const { t } = useTranslation();
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'info';

  return (
    <div className="b-page">
      <PageHeader icon={<UserOutlined />} title={t('account:title')} />
      <Card>
        <Tabs
          activeKey={tab}
          onChange={(key) => setParams(key === 'info' ? {} : { tab: key }, { replace: true })}
          items={[
            {
              key: 'info',
              icon: <UserOutlined />,
              label: t('account:tabs.info'),
              children: (
                <SettingsSection
                  title={t('account:sections.personal.title')}
                  description={t('account:sections.personal.description')}
                >
                  <ProfileInfoForm />
                </SettingsSection>
              ),
            },
            {
              key: 'security',
              icon: <LockOutlined />,
              label: t('account:tabs.security'),
              children: (
                <>
                  <SettingsSection
                    title={t('account:sections.password.title')}
                    description={t('account:sections.password.description')}
                  >
                    <ChangePasswordForm />
                  </SettingsSection>
                  <SettingsSection
                    title={t('account:sections.twoFactor.title')}
                    description={t('account:sections.twoFactor.description')}
                  >
                    <TwoFactorSettings />
                  </SettingsSection>
                </>
              ),
            },
            {
              key: 'loginHistory',
              icon: <HistoryOutlined />,
              label: t('account:tabs.loginHistory'),
              children: (
                <>
                  <Typography.Text type="secondary" className="b-login-history__intro">
                    {t('account:loginHistory.description')}
                  </Typography.Text>
                  <LoginHistoryTable
                    queryKey={LOGIN_HISTORY_KEY}
                    fetcher={(query) => api.me.loginHistory(query)}
                  />
                </>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

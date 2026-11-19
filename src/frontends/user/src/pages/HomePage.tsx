import {
  BellOutlined,
  SafetyCertificateOutlined,
  ShoppingCartOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { displayName, PageHeader, useAuth, useUnreadCount } from '@base/ui';
import { Card, Col, Row, Statistic, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

function ActionCard({
  icon,
  title,
  children,
  to,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  to: string;
}) {
  const { t } = useTranslation('home');
  return (
    <Card className="home-card">
      <div className="home-card__icon">{icon}</div>
      <Typography.Title level={5}>{title}</Typography.Title>
      <div className="home-card__body">{children}</div>
      <Link to={to}>{t('open')} →</Link>
    </Card>
  );
}

export function HomePage() {
  const { t } = useTranslation('home');
  const { user, can } = useAuth();
  const unread = useUnreadCount();
  if (!user) return null;

  return (
    <div className="b-page">
      <PageHeader title={t('welcome', { name: displayName(user) })} subtitle={t('subtitle')} />
      <Row gutter={[16, 16]}>
        {can('sales.create') && (
          <Col xs={24} md={8}>
            <ActionCard icon={<ShoppingCartOutlined />} title={t('posCard')} to="/pos">
              <Typography.Text type="secondary">{t('posCardDescription')}</Typography.Text>
            </ActionCard>
          </Col>
        )}
        <Col xs={24} md={8}>
          <ActionCard icon={<UserOutlined />} title={t('profileCard')} to="/profile">
            <Typography.Text type="secondary">{t('profileCardDescription')}</Typography.Text>
          </ActionCard>
        </Col>
        <Col xs={24} md={8}>
          <ActionCard
            icon={<SafetyCertificateOutlined />}
            title={t('securityCard')}
            to="/profile?tab=security"
          >
            <Typography.Text type="secondary">
              {user.twoFactorEnabled ? t('securityCardOn') : t('securityCardOff')}
            </Typography.Text>
          </ActionCard>
        </Col>
        <Col xs={24} md={8}>
          <ActionCard icon={<BellOutlined />} title={t('notificationsCard')} to="/notifications">
            <Statistic value={unread.data ?? 0} loading={unread.isPending} />
          </ActionCard>
        </Col>
      </Row>
    </div>
  );
}

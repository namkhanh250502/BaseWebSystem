import { TeamOutlined } from '@ant-design/icons';
import { displayName, getErrorMessage, PageHeader, useApi, useAuth } from '@base/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, Row, Select, Skeleton, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/** Màu theo bảng màu biểu đồ của hệ thống gốc */
const USERS_COLOR = '#ec4899';

const axisProps = { stroke: '#94a3b8', fontSize: 12, tickLine: false, axisLine: false } as const;

function UserGrowthCard() {
  const { t } = useTranslation('dashboard');
  const api = useApi();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const growth = useQuery({
    queryKey: ['dashboard', 'user-growth', year],
    queryFn: () => api.dashboard.userGrowth(year),
    placeholderData: keepPreviousData,
  });

  const currentYear = new Date().getFullYear();
  const firstYear = Math.min(growth.data?.firstYear ?? currentYear, currentYear);
  const years = Array.from({ length: currentYear - firstYear + 1 }, (_, i) => currentYear - i);
  const monthLabel = (value: unknown) => t(`months.m${String(value)}`);

  return (
    <Card variant="borderless" className="dash-chart-card">
      <div className="dash-chart-card__head">
        <div className="dash-chart-card__icon" style={{ background: `${USERS_COLOR}1a`, color: USERS_COLOR }}>
          <TeamOutlined />
        </div>
        <div className="dash-chart-card__titles">
          <Typography.Text strong className="dash-chart-card__title">
            {t('userGrowthChart')}
          </Typography.Text>
          <Typography.Text type="secondary" className="dash-chart-card__desc">
            {growth.data
              ? t('totalInYear', { year: growth.data.year, count: growth.data.totalNewUsers })
              : t('userGrowthChartDesc')}
          </Typography.Text>
        </div>
        <Select
          aria-label={t('year')}
          value={year}
          onChange={setYear}
          options={years.map((y) => ({ value: y, label: y }))}
          style={{ width: 100 }}
        />
      </div>
      {growth.isError ? (
        <Alert type="error" showIcon title={getErrorMessage(growth.error, t)} />
      ) : growth.isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={growth.data.months} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="usersGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={USERS_COLOR} stopOpacity={0.35} />
                <stop offset="95%" stopColor={USERS_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="month" tickFormatter={monthLabel} {...axisProps} />
            <YAxis allowDecimals={false} width={40} {...axisProps} />
            <Tooltip
              labelFormatter={(month) => t('monthFull', { month: String(month), year })}
              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0' }}
            />
            <Area
              type="monotone"
              dataKey="newUsers"
              stroke={USERS_COLOR}
              strokeWidth={2.5}
              fill="url(#usersGradient)"
              name={t('newUsers')}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const { user, can } = useAuth();

  return (
    <div className="b-page">
      <PageHeader title={t('welcome', { name: user ? displayName(user) : '' })} subtitle={t('subtitle')} />
      {can('dashboard.userGrowth') && (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}>
            <UserGrowthCard />
          </Col>
        </Row>
      )}
    </div>
  );
}

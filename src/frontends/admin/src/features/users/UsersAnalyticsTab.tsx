import { MailOutlined, PercentageOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import type { UserAnalyticsQuery, UserAnalyticsUnit } from '@base/shared';
import { getErrorMessage, useApi } from '@base/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, DatePicker, Segmented, Skeleton, Tooltip, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Mode = 'year' | 'month' | 'range';

const BROWSER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Dài hơn một quý thì chia theo ngày quá dày, chuyển sang theo tháng */
const MAX_DAILY_SPAN_DAYS = 92;

/** Màu theo bảng màu biểu đồ của hệ thống gốc */
const SERIES = [
  { key: 'newUsers', labelKey: 'analytics.newUsers', color: '#3d97ff' },
  { key: 'newVerifiedUsers', labelKey: 'analytics.newVerifiedUsers', color: '#10b981' },
] as const;

const CHART_COLORS = { grid: '#ececef', tick: '#75787e', cursor: '#cfd0d4' };

interface ChartPoint {
  label: string;
  tooltipLabel: string;
  newUsers: number;
  newVerifiedUsers: number;
}

const modeRange = (mode: Exclude<Mode, 'range'>): [Dayjs, Dayjs] => {
  const today = dayjs();
  return [today.startOf(mode), today];
};

function StatCard(props: {
  tone: 'blue' | 'emerald' | 'amber';
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className={`users-stat users-stat--${props.tone}`}>
      <div className="users-stat__body">
        <div className="users-stat__label">{props.label}</div>
        <div className="users-stat__value">{props.value}</div>
        {props.sub && <div className="users-stat__sub">{props.sub}</div>}
      </div>
      <div className="users-stat__icon">{props.icon}</div>
    </div>
  );
}

function GrowthTooltip({
  active,
  payload,
  formatValue,
  seriesLabel,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  formatValue: (v: number) => string;
  seriesLabel: (key: (typeof SERIES)[number]['labelKey']) => string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="users-chart-tooltip">
      <div className="users-chart-tooltip__title">{point.tooltipLabel}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="users-chart-tooltip__row">
          <span className="users-chart-legend__item">
            <span className="users-chart-legend__dot" style={{ background: s.color }} />
            {seriesLabel(s.labelKey)}
          </span>
          <span className="users-chart-tooltip__value">{formatValue(point[s.key])}</span>
        </div>
      ))}
    </div>
  );
}

/** Tab "Phân tích" ở trang Người dùng: thẻ tổng quan + biểu đồ người dùng mới theo ngày/tháng */
export function UsersAnalyticsTab() {
  const { t, i18n } = useTranslation(['users', 'common']);
  const api = useApi();
  const [mode, setMode] = useState<Mode>('year');
  const [customDates, setCustomDates] = useState<[Dayjs, Dayjs]>(() => modeRange('month'));

  const dates = mode === 'range' ? customDates : modeRange(mode);
  const unit: UserAnalyticsUnit =
    mode === 'year' || (mode === 'range' && dates[1].diff(dates[0], 'day') > MAX_DAILY_SPAN_DAYS)
      ? 'month'
      : 'day';

  // Biên khoảng gửi dạng mốc tuyệt đối kèm múi giờ máy người xem → backend gom đúng ngày họ thấy.
  // Khoá query dùng ngày (không dùng giờ hiện tại) để không tạo query mới ở mỗi lần render.
  const query: UserAnalyticsQuery = {
    from: dates[0].startOf('day').toISOString(),
    to: dates[1].endOf('day').toISOString(),
    timeZone: BROWSER_TIME_ZONE,
    unit,
  };
  const analytics = useQuery({
    queryKey: ['users', 'analytics', query],
    queryFn: () => api.users.analytics(query),
    placeholderData: keepPreviousData,
  });

  const numberFormat = new Intl.NumberFormat(i18n.language);
  const format = (v: number) => numberFormat.format(v);

  const chartData: ChartPoint[] = (analytics.data?.points ?? []).map((p) => {
    const date = dayjs(p.bucket);
    return {
      label:
        unit === 'month'
          ? t('analytics.monthShort', { month: date.format('M') })
          : date.format('DD/MM'),
      tooltipLabel:
        unit === 'month'
          ? t('analytics.monthFull', { month: date.format('MM/YYYY') })
          : date.format('DD/MM/YYYY'),
      newUsers: p.newUsers,
      newVerifiedUsers: p.newVerifiedUsers,
    };
  });

  const totalUsers = analytics.data?.totalUsers ?? 0;
  const verifiedUsers = analytics.data?.verifiedUsers ?? 0;
  const verifiedRate = totalUsers > 0 ? ((verifiedUsers / totalUsers) * 100).toFixed(1) : '0';
  const rangeLabel = `${dates[0].format('DD/MM/YYYY')} – ${dates[1].format('DD/MM/YYYY')}`;

  return (
    <>
      <div className="b-toolbar">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { label: t('analytics.thisYear'), value: 'year' },
            { label: t('analytics.thisMonth'), value: 'month' },
            { label: t('analytics.customRange'), value: 'range' },
          ]}
        />
        {mode === 'range' && (
          <DatePicker.RangePicker
            value={customDates}
            onChange={(v) => {
              if (v?.[0] && v[1]) setCustomDates([v[0], v[1]]);
            }}
            format="DD/MM/YYYY"
            allowClear={false}
            maxDate={dayjs()}
          />
        )}
        <Tooltip title={t('analytics.reload')}>
          <Button
            icon={<ReloadOutlined />}
            aria-label={t('analytics.reload')}
            loading={analytics.isFetching}
            onClick={() => void analytics.refetch()}
          />
        </Tooltip>
      </div>

      {analytics.isError && (
        <Alert
          className="b-mb-16"
          type="error"
          showIcon
          title={getErrorMessage(analytics.error, t)}
        />
      )}

      <div className="users-stats">
        <StatCard
          tone="blue"
          icon={<TeamOutlined />}
          label={t('analytics.totalUsers')}
          value={format(totalUsers)}
          sub={t('analytics.asOf', { date: dates[1].format('DD/MM/YYYY') })}
        />
        <StatCard
          tone="emerald"
          icon={<MailOutlined />}
          label={t('analytics.verifiedUsers')}
          value={format(verifiedUsers)}
          sub={t('analytics.verifiedUsersHint')}
        />
        <StatCard
          tone="amber"
          icon={<PercentageOutlined />}
          label={t('analytics.verifiedRate')}
          value={`${verifiedRate}%`}
          sub={t('analytics.verifiedRateHint')}
        />
      </div>

      <Card variant="borderless" className="dash-chart-card">
        <div className="dash-chart-card__head">
          <div className="dash-chart-card__titles">
            <Typography.Text strong className="dash-chart-card__title">
              {t('analytics.chartTitle')}
            </Typography.Text>
            <Typography.Text type="secondary" className="dash-chart-card__desc">
              {t(unit === 'month' ? 'analytics.chartDescMonth' : 'analytics.chartDescDay', {
                range: rangeLabel,
              })}
            </Typography.Text>
          </div>
          <div className="users-chart-legend">
            {SERIES.map((s) => (
              <span key={s.key} className="users-chart-legend__item">
                <span className="users-chart-legend__dot" style={{ background: s.color }} />
                {t(s.labelKey)}
              </span>
            ))}
          </div>
        </div>
        {analytics.isPending ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : chartData.length === 0 ? (
          <div className="users-chart-empty">{t('analytics.noData')}</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: CHART_COLORS.tick }}
                tickLine={false}
                axisLine={false}
                minTickGap={12}
              />
              <YAxis
                tick={{ fontSize: 12, fill: CHART_COLORS.tick }}
                tickLine={false}
                axisLine={false}
                tickFormatter={format}
                allowDecimals={false}
                width={52}
              />
              <ChartTooltip
                content={<GrowthTooltip formatValue={format} seriesLabel={(k) => t(k)} />}
                cursor={{ fill: CHART_COLORS.cursor, fillOpacity: 0.3 }}
              />
              {SERIES.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={t(s.labelKey)}
                  fill={s.color}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </>
  );
}

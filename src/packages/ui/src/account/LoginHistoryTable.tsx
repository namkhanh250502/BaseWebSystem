import {
  DesktopOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  MobileOutlined,
  QuestionCircleOutlined,
  RobotOutlined,
  TabletOutlined,
} from '@ant-design/icons';
import {
  LOGIN_HISTORY_LIMIT,
  type DeviceInfo,
  type ListLoginHistoryQuery,
  type LoginHistoryDto,
  type Paginated,
} from '@base/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Table, Tag, Tooltip, Typography, type TableColumnsType } from 'antd';
import type { TFunction } from 'i18next';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime, fromNow, getErrorMessage } from '../utils';

const { Text } = Typography;

const DEVICE_ICONS: Record<DeviceInfo['type'], ReactNode> = {
  desktop: <DesktopOutlined />,
  mobile: <MobileOutlined />,
  tablet: <TabletOutlined />,
  bot: <RobotOutlined />,
  unknown: <QuestionCircleOutlined />,
};

const join = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(' ');

/** Tên quốc gia theo ngôn ngữ đang chọn (Intl), không có thì dùng tên server trả về */
function countryName(code: string | null, fallback: string | null, lang: string): string | null {
  if (code) {
    try {
      return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? fallback ?? code;
    } catch {
      return fallback ?? code;
    }
  }
  return fallback;
}

function renderLocation(row: LoginHistoryDto, t: TFunction, lang: string) {
  if (row.location) {
    const { city, region, countryCode, country } = row.location;
    const place = [city, region !== city ? region : null, countryName(countryCode, country, lang)]
      .filter(Boolean)
      .join(', ');
    return (
      <span>
        <EnvironmentOutlined className="b-login-history__muted-icon" /> {place}
      </span>
    );
  }
  if (row.isPrivateIp)
    return <Text type="secondary">{t('account:loginHistory.localNetwork')}</Text>;
  return <Text type="secondary">{t('account:loginHistory.unknown')}</Text>;
}

function renderDevice({ device, userAgent }: LoginHistoryDto, t: TFunction) {
  const browser = join(device.browser, device.browserVersion);
  const os = join(device.os, device.osVersion);
  const title = [browser, os].filter(Boolean).join(' · ') || t('account:loginHistory.unknown');
  const sub = [t(`account:loginHistory.deviceTypes.${device.type}`), device.model]
    .filter(Boolean)
    .join(' · ');
  return (
    <Tooltip title={userAgent} placement="topLeft">
      <div className="b-login-history__device">
        <span className="b-login-history__device-icon">{DEVICE_ICONS[device.type]}</span>
        <div>
          <div>{title}</div>
          <Text type="secondary" className="b-login-history__sub">
            {sub}
          </Text>
        </div>
      </div>
    </Tooltip>
  );
}

export interface LoginHistoryTableProps {
  /** Khoá react-query, phân biệt user (ví dụ ['me', 'login-history'] hoặc ['users', id, 'login-history']) */
  queryKey: readonly unknown[];
  fetcher: (query: ListLoginHistoryQuery) => Promise<Paginated<LoginHistoryDto>>;
  /** Hiện cột trang đăng nhập (admin / user) */
  showApp?: boolean;
  pageSize?: number;
  size?: 'small' | 'middle';
}

/** Bảng lịch sử đăng nhập: thời gian, thiết bị, IP, vị trí (dùng cho cả trang user và admin) */
export function LoginHistoryTable({
  queryKey,
  fetcher,
  showApp = true,
  pageSize = 10,
  size = 'middle',
}: LoginHistoryTableProps) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: [...queryKey, { page, pageSize }],
    queryFn: () => fetcher({ page, pageSize }),
    placeholderData: keepPreviousData,
  });

  const columns: TableColumnsType<LoginHistoryDto> = [
    {
      key: 'time',
      title: t('account:loginHistory.columns.time'),
      width: 170,
      render: (_, row) => (
        <div>
          <div>{formatDateTime(row.createdAt)}</div>
          <Text type="secondary" className="b-login-history__sub">
            {fromNow(row.createdAt)}
          </Text>
        </div>
      ),
    },
    {
      key: 'device',
      title: t('account:loginHistory.columns.device'),
      render: (_, row) => renderDevice(row, t),
    },
    {
      key: 'ip',
      title: t('account:loginHistory.columns.ip'),
      width: 170,
      render: (_, row) =>
        row.ipAddress ? (
          <Text copyable className="b-login-history__ip">
            {row.ipAddress}
          </Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      key: 'location',
      title: t('account:loginHistory.columns.location'),
      render: (_, row) => renderLocation(row, t, i18n.language),
    },
  ];
  if (showApp) {
    columns.push({
      key: 'app',
      title: t('account:loginHistory.columns.app'),
      width: 110,
      render: (_, row) => (
        <Tag color={row.app === 'admin' ? 'volcano' : 'blue'} style={{ margin: 0 }}>
          {t(`account:loginHistory.apps.${row.app}`)}
        </Tag>
      ),
    });
  }

  if (list.isError) {
    return <Alert type="error" showIcon title={getErrorMessage(list.error, t)} />;
  }

  return (
    <>
      <Text type="secondary" className="b-login-history__limit">
        <InfoCircleOutlined /> {t('account:loginHistory.limitNote', { count: LOGIN_HISTORY_LIMIT })}
      </Text>
      <Table<LoginHistoryDto>
        className="b-login-history"
        rowKey="id"
        size={size}
        columns={columns}
        dataSource={list.data?.items}
        loading={list.isFetching}
        scroll={{ x: 760 }}
        locale={{ emptyText: t('account:loginHistory.empty') }}
        pagination={{
          current: page,
          pageSize,
          total: list.data?.meta.total ?? 0,
          hideOnSinglePage: true,
          onChange: (p) => setPage(p),
        }}
      />
    </>
  );
}

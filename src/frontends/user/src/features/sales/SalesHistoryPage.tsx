import { HistoryOutlined } from '@ant-design/icons';
import {
  businessDate,
  DOCUMENT_STATUSES,
  type DocumentStatus,
  type ListSalesOrdersQuery,
  type SalesOrderDto,
} from '@base/shared';
import {
  DocumentStatusTag,
  formatDateTime,
  PageHeader,
  PaymentStatusTag,
  useApi,
  useAuth,
  useCommerceFormat,
  useDebouncedValue,
} from '@base/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card, Checkbox, DatePicker, Empty, Input, Select, Table, type TableProps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

/** Lịch sử đơn bán: mặc định hôm nay, đơn của tôi (nhân viên chỉ thấy đơn mình tạo) */
export function SalesHistoryPage() {
  const { t } = useTranslation(['sales', 'commerce', 'common']);
  const api = useApi();
  const { can } = useAuth();
  const format = useCommerceFormat();
  const navigate = useNavigate();
  const today = dayjs(businessDate());
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<DocumentStatus>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>([today, today]);
  const [mine, setMine] = useState(true);
  const debounced = useDebouncedValue(search.trim(), 400);
  const query: ListSalesOrdersQuery = {
    page,
    pageSize: 20,
    search: debounced || undefined,
    status,
    mine: mine ? 'true' : undefined,
    dateFrom: range?.[0]?.format('YYYY-MM-DD'),
    dateTo: range?.[1]?.format('YYYY-MM-DD'),
  };
  const list = useQuery({
    queryKey: ['sales-orders', 'history', query],
    queryFn: () => api.salesOrders.list(query),
    placeholderData: keepPreviousData,
  });

  const columns: TableProps<SalesOrderDto>['columns'] = [
    {
      key: 'code',
      title: t('commerce:orderCode'),
      render: (_, o) => <Link to={`/sales/${o.id}`}>{o.code}</Link>,
    },
    {
      key: 'time',
      title: t('time'),
      render: (_, o) => formatDateTime(o.confirmedAt ?? o.createdAt),
    },
    {
      key: 'customer',
      title: t('commerce:customer'),
      render: (_, o) => [o.customerName, o.customerPhone].filter(Boolean).join(' · ') || '—',
    },
    {
      key: 'total',
      title: t('commerce:totalAmount'),
      align: 'right',
      render: (_, o) => format.money(o.totalAmount),
    },
    {
      key: 'status',
      title: t('common:status'),
      render: (_, o) => <DocumentStatusTag status={o.status} />,
    },
    {
      key: 'payment',
      title: t('commerce:payment'),
      render: (_, o) => <PaymentStatusTag status={o.paymentStatus} />,
    },
  ];

  return (
    <div className="b-page">
      <PageHeader
        icon={<HistoryOutlined />}
        title={t('title')}
        subtitle={t('subtitle')}
        count={list.data?.meta.total}
      />
      <Card>
        <div className="b-toolbar">
          <Input.Search
            allowClear
            className="b-toolbar__search"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 160 }}
            placeholder={t('statusAll')}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={DOCUMENT_STATUSES.map((s) => ({
              value: s,
              label: t(`commerce:documentStatus.${s}`),
            }))}
          />
          <DatePicker.RangePicker
            value={range}
            onChange={(v) => {
              setRange(v);
              setPage(1);
            }}
          />
          {can('sales.viewAll') && (
            <Checkbox
              checked={mine}
              onChange={(e) => {
                setMine(e.target.checked);
                setPage(1);
              }}
            >
              {t('mineOnly')}
            </Checkbox>
          )}
        </div>
        <Table<SalesOrderDto>
          rowKey="id"
          columns={columns}
          dataSource={list.data?.items}
          loading={list.isFetching}
          scroll={{ x: 760 }}
          onRow={(o) => ({ onClick: () => navigate(`/sales/${o.id}`) })}
          locale={{ emptyText: <Empty description={t('empty')} /> }}
          pagination={{
            current: page,
            pageSize: 20,
            total: list.data?.meta.total,
            onChange: setPage,
            showTotal: (total) => t('common:total', { count: total }),
          }}
        />
      </Card>
    </div>
  );
}

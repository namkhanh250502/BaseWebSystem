import { PlusOutlined, ToolOutlined } from '@ant-design/icons';
import {
  ADJUSTMENT_REASONS,
  type AdjustmentReason,
  type InventoryAdjustmentDetailDto,
  type InventoryAdjustmentDto,
  type ListAdjustmentsQuery,
} from '@base/shared';
import {
  AdjustmentReasonTag,
  formatDateTime,
  PageHeader,
  useApi,
  useAuth,
  useCommerceFormat,
  useDebouncedValue,
} from '@base/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Empty,
  Input,
  Result,
  Select,
  Skeleton,
  Table,
  Typography,
  type TableProps,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';

export function AdjustmentsPage() {
  const { t } = useTranslation(['inventory', 'commerce', 'common']);
  const api = useApi();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [reason, setReason] = useState<AdjustmentReason>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 400);

  const query: ListAdjustmentsQuery = {
    page,
    pageSize,
    reason,
    search: debounced || undefined,
    dateFrom: range?.[0]?.format('YYYY-MM-DD'),
    dateTo: range?.[1]?.format('YYYY-MM-DD'),
  };
  const list = useQuery({
    queryKey: ['inventory', 'adjustments', query],
    queryFn: () => api.inventory.adjustments(query),
    placeholderData: keepPreviousData,
  });

  const columns: TableProps<InventoryAdjustmentDto>['columns'] = [
    {
      key: 'code',
      title: t('commerce:code'),
      width: 190,
      render: (_, a) => <Link to={`/inventory/adjustments/${a.id}`}>{a.code}</Link>,
    },
    {
      key: 'date',
      title: t('commerce:date'),
      width: 170,
      render: (_, a) => formatDateTime(a.createdAt),
    },
    {
      key: 'reason',
      title: t('commerce:reason'),
      width: 140,
      render: (_, a) => <AdjustmentReasonTag reason={a.reason} />,
    },
    { key: 'note', title: t('commerce:notes'), ellipsis: true, render: (_, a) => a.note ?? '—' },
    {
      key: 'items',
      title: t('itemCount'),
      align: 'right',
      width: 110,
      render: (_, a) => a.itemCount,
    },
    {
      key: 'by',
      title: t('commerce:createdBy'),
      width: 170,
      render: (_, a) => a.createdBy?.name ?? '—',
    },
  ];

  return (
    <div className="b-page">
      <PageHeader
        icon={<ToolOutlined />}
        title={t('adjustments')}
        subtitle={t('adjustmentsSubtitle')}
        count={list.data?.meta.total}
        actions={
          can('inventory.adjust') && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/inventory/adjustments/new')}
            >
              {t('adjust')}
            </Button>
          )
        }
      />
      <Card>
        <div className="b-toolbar">
          <Input.Search
            allowClear
            className="b-toolbar__search"
            placeholder={t('codeSearch')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 170 }}
            placeholder={t('reasonAll')}
            value={reason}
            onChange={(v) => {
              setReason(v);
              setPage(1);
            }}
            options={ADJUSTMENT_REASONS.map((r) => ({
              value: r,
              label: t(`commerce:adjustmentReason.${r}`),
            }))}
          />
          <DatePicker.RangePicker
            value={range}
            onChange={(v) => {
              setRange(v);
              setPage(1);
            }}
          />
        </div>
        <Table<InventoryAdjustmentDto>
          rowKey="id"
          columns={columns}
          dataSource={list.data?.items}
          loading={list.isFetching}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description={t('noAdjustments')} /> }}
          pagination={{
            current: page,
            pageSize,
            total: list.data?.meta.total,
            showSizeChanger: true,
            showTotal: (total) => t('common:total', { count: total }),
          }}
          onChange={(p) => {
            setPage(p.current ?? 1);
            setPageSize(p.pageSize ?? 20);
          }}
        />
      </Card>
    </div>
  );
}

type AdjustmentItem = InventoryAdjustmentDetailDto['items'][number];

export function AdjustmentDetailPage() {
  const { t } = useTranslation(['inventory', 'commerce', 'common']);
  const { id } = useParams();
  const api = useApi();
  const format = useCommerceFormat();
  const detail = useQuery({
    queryKey: ['inventory', 'adjustments', 'detail', id],
    queryFn: () => api.inventory.adjustment(id!),
  });
  if (detail.isLoading) return <Skeleton active />;
  if (!detail.data) return <Result status="404" title={t('adjustmentNotFound')} />;
  const a = detail.data;
  return (
    <div className="b-page">
      <PageHeader
        icon={<ToolOutlined />}
        title={a.code}
        subtitle={t(`commerce:adjustmentReason.${a.reason}`)}
      />
      <Card>
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 3 }}
          items={[
            {
              key: 'reason',
              label: t('commerce:reason'),
              children: <AdjustmentReasonTag reason={a.reason} />,
            },
            { key: 'date', label: t('commerce:date'), children: formatDateTime(a.createdAt) },
            { key: 'by', label: t('commerce:createdBy'), children: a.createdBy?.name ?? '—' },
            ...(a.note
              ? [{ key: 'note', label: t('commerce:notes'), children: a.note, span: 3 }]
              : []),
          ]}
        />
        <Table<AdjustmentItem>
          rowKey="id"
          size="small"
          style={{ marginTop: 16 }}
          pagination={false}
          dataSource={a.items}
          scroll={{ x: 700 }}
          columns={[
            {
              key: 'product',
              title: t('commerce:product'),
              render: (_, i) => (
                <>
                  <Typography.Text strong>{i.product.sku}</Typography.Text> {i.product.name}
                </>
              ),
            },
            {
              key: 'before',
              title: t('before'),
              align: 'right',
              render: (_, i) => format.quantity(i.quantityBefore),
            },
            ...(a.reason === 'STOCKTAKE'
              ? [
                  {
                    key: 'counted',
                    title: t('counted'),
                    align: 'right' as const,
                    render: (_: unknown, i: AdjustmentItem) => format.quantity(i.countedQuantity),
                  },
                ]
              : []),
            {
              key: 'change',
              title: t('change'),
              align: 'right',
              render: (_, i) => (
                <Typography.Text type={i.quantityChange.startsWith('-') ? 'danger' : 'success'}>
                  {i.quantityChange.startsWith('-') ? '' : '+'}
                  {format.quantity(i.quantityChange)}
                </Typography.Text>
              ),
            },
            {
              key: 'after',
              title: t('after'),
              align: 'right',
              render: (_, i) => format.quantity(i.quantityAfter),
            },
          ]}
        />
      </Card>
    </div>
  );
}

import { HistoryOutlined } from '@ant-design/icons';
import {
  MOVEMENT_REF_TYPES,
  MOVEMENT_TYPES,
  type InventoryMovementDto,
  type ListMovementsQuery,
  type MovementRefType,
  type MovementType,
} from '@base/shared';
import {
  AdjustmentReasonTag,
  formatDateTime,
  MovementTypeTag,
  PageHeader,
  ProductSelect,
  useApi,
  useAuth,
  useCommerceFormat,
  useDebouncedValue,
} from '@base/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card, DatePicker, Empty, Input, Select, Table, Typography, type TableProps } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

/** Đường dẫn tới chứng từ nguồn của biến động */
function refLink(ref: InventoryMovementDto['ref']): string | null {
  switch (ref.type) {
    case 'PURCHASE_RECEIPT':
      return `/purchases/${ref.id}`;
    case 'SALES_ORDER':
      return `/sales-orders/${ref.id}`;
    case 'INVENTORY_ADJUSTMENT':
      return `/inventory/adjustments/${ref.id}`;
  }
}

/** Sổ biến động tồn kho (chỉ đọc): mọi lần nhập, bán, huỷ, điều chỉnh */
export function MovementsPage() {
  const { t } = useTranslation(['inventory', 'commerce', 'common']);
  const api = useApi();
  const { can } = useAuth();
  const format = useCommerceFormat();
  const [params] = useSearchParams();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [productId, setProductId] = useState<string | undefined>(
    params.get('productId') ?? undefined,
  );
  const [type, setType] = useState<MovementType>();
  const [refType, setRefType] = useState<MovementRefType>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 400);

  const query: ListMovementsQuery = {
    page,
    pageSize,
    productId,
    type,
    refType,
    search: debounced || undefined,
    dateFrom: range?.[0]?.format('YYYY-MM-DD'),
    dateTo: range?.[1]?.format('YYYY-MM-DD'),
  };
  const list = useQuery({
    queryKey: ['inventory', 'movements', query],
    queryFn: () => api.inventory.movements(query),
    placeholderData: keepPreviousData,
  });
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const columns: TableProps<InventoryMovementDto>['columns'] = [
    {
      key: 'time',
      title: t('commerce:date'),
      width: 170,
      render: (_, m) => formatDateTime(m.createdAt),
    },
    {
      key: 'product',
      title: t('commerce:product'),
      render: (_, m) => (
        <>
          <Typography.Text strong>{m.product.sku}</Typography.Text> {m.product.name}
        </>
      ),
    },
    {
      key: 'type',
      title: t('movementTypeLabel'),
      width: 160,
      render: (_, m) => <MovementTypeTag type={m.type} />,
    },
    {
      key: 'change',
      title: t('change'),
      align: 'right',
      width: 120,
      render: (_, m) => (
        <Typography.Text type={m.quantityChange.startsWith('-') ? 'danger' : 'success'}>
          {m.quantityChange.startsWith('-') ? '' : '+'}
          {format.quantity(m.quantityChange)}
        </Typography.Text>
      ),
    },
    {
      key: 'after',
      title: t('after'),
      align: 'right',
      width: 110,
      render: (_, m) => format.quantity(m.quantityAfter),
    },
    ...(can('inventory.viewValue')
      ? ([
          {
            key: 'cost',
            title: t('commerce:unitCost'),
            align: 'right',
            width: 130,
            render: (_, m) => format.money(m.unitCost),
          },
        ] satisfies TableProps<InventoryMovementDto>['columns'])
      : []),
    {
      key: 'ref',
      title: t('document'),
      width: 190,
      render: (_, m) => {
        const to = refLink(m.ref);
        const allowed =
          (m.ref.type === 'PURCHASE_RECEIPT' && can('purchases.list')) ||
          (m.ref.type === 'SALES_ORDER' && can('sales.list')) ||
          (m.ref.type === 'INVENTORY_ADJUSTMENT' && can('inventory.adjustments.list'));
        return to && allowed ? <Link to={to}>{m.ref.code}</Link> : m.ref.code;
      },
    },
    {
      key: 'reason',
      title: t('commerce:reason'),
      width: 200,
      render: (_, m) => (
        <>
          {m.reason && <AdjustmentReasonTag reason={m.reason} />}
          {m.note && <Typography.Text type="secondary">{m.note}</Typography.Text>}
        </>
      ),
    },
    {
      key: 'by',
      title: t('commerce:createdBy'),
      width: 160,
      render: (_, m) => m.createdBy?.name ?? '—',
    },
  ];

  return (
    <div className="b-page">
      <PageHeader
        icon={<HistoryOutlined />}
        title={t('movements')}
        subtitle={t('movementsSubtitle')}
        count={list.data?.meta.total}
      />
      <Card>
        <div className="b-toolbar">
          <Input.Search
            allowClear
            className="b-toolbar__search"
            placeholder={t('movementSearch')}
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
          />
          <ProductSelect
            allowClear
            activeOnly={false}
            style={{ width: 260 }}
            value={productId}
            onChange={(id) => resetPage(setProductId)(id)}
            onClear={() => resetPage(setProductId)(undefined)}
          />
          <Select
            allowClear
            style={{ width: 170 }}
            placeholder={t('movementTypeAll')}
            value={type}
            onChange={resetPage(setType)}
            options={MOVEMENT_TYPES.map((v) => ({
              value: v,
              label: t(`commerce:movementType.${v}`),
            }))}
          />
          <Select
            allowClear
            style={{ width: 170 }}
            placeholder={t('refTypeAll')}
            value={refType}
            onChange={resetPage(setRefType)}
            options={MOVEMENT_REF_TYPES.map((v) => ({
              value: v,
              label: t(`commerce:refType.${v}`),
            }))}
          />
          <DatePicker.RangePicker value={range} onChange={resetPage(setRange)} />
        </div>
        <Table<InventoryMovementDto>
          rowKey="id"
          columns={columns}
          dataSource={list.data?.items}
          loading={list.isFetching}
          scroll={{ x: 1300 }}
          locale={{ emptyText: <Empty description={t('noMovements')} /> }}
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

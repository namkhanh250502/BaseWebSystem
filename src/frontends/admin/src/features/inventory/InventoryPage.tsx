import { DatabaseOutlined, HistoryOutlined, ToolOutlined } from '@ant-design/icons';
import {
  PRODUCT_STATUSES,
  STOCK_STATES,
  type InventoryItemDto,
  type ListInventoryQuery,
  type ProductStatus,
  type StockState,
} from '@base/shared';
import {
  formatDateTime,
  PageHeader,
  StockStateTag,
  useApi,
  useAuth,
  useCommerceFormat,
  useDebouncedValue,
} from '@base/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  Empty,
  Input,
  Select,
  Space,
  Statistic,
  Table,
  theme,
  Typography,
  type TableProps,
} from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { CategorySelect } from '../products/CategorySelect';

/** Tồn hiện tại theo sản phẩm + thẻ tổng hợp (tổng SL, giá trị, sắp hết, hết hàng) */
export function InventoryPage() {
  const { t } = useTranslation(['inventory', 'commerce', 'common']);
  const api = useApi();
  const { can } = useAuth();
  const navigate = useNavigate();
  const format = useCommerceFormat();
  const canViewValue = can('inventory.viewValue');
  const { token } = theme.useToken();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>();
  const [status, setStatus] = useState<ProductStatus>();
  const [stockState, setStockState] = useState<StockState>();
  const [sort, setSort] = useState<Pick<ListInventoryQuery, 'sortBy' | 'sortOrder'>>({});
  const debounced = useDebouncedValue(search.trim(), 400);

  const filters = { search: debounced || undefined, categoryId, status };
  const query: ListInventoryQuery = { page, pageSize, stockState, ...filters, ...sort };
  const list = useQuery({
    queryKey: ['inventory', 'list', query],
    queryFn: () => api.inventory.list(query),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: ['inventory', 'summary', filters],
    queryFn: () => api.inventory.summary(filters),
    placeholderData: keepPreviousData,
  });
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const columns: TableProps<InventoryItemDto>['columns'] = [
    {
      key: 'name',
      title: t('commerce:product'),
      sorter: true,
      render: (_, i) => (
        <>
          <Typography.Text strong>{i.name}</Typography.Text>
          <br />
          <Typography.Text type="secondary">{i.sku}</Typography.Text>
        </>
      ),
    },
    {
      key: 'category',
      title: t('commerce:category'),
      width: 160,
      render: (_, i) => i.category.name,
    },
    {
      key: 'quantity',
      title: t('commerce:stock'),
      align: 'right',
      width: 140,
      sorter: true,
      render: (_, i) => `${format.quantity(i.quantity)} ${i.unit}`,
    },
    {
      key: 'min',
      title: t('commerce:minStock'),
      align: 'right',
      width: 130,
      render: (_, i) => format.quantity(i.minStock),
    },
    {
      key: 'state',
      title: t('stockState'),
      width: 130,
      render: (_, i) => <StockStateTag state={i.state} />,
    },
    ...(canViewValue
      ? ([
          {
            key: 'avgCost',
            title: t('commerce:avgCost'),
            align: 'right',
            width: 140,
            render: (_, i) => format.money(i.avgCost),
          },
          {
            key: 'value',
            title: t('commerce:value'),
            align: 'right',
            width: 160,
            sorter: true,
            render: (_, i) => format.money(i.value),
          },
        ] satisfies TableProps<InventoryItemDto>['columns'])
      : []),
    {
      key: 'last',
      title: t('lastMovement'),
      width: 170,
      render: (_, i) => (i.lastMovementAt ? formatDateTime(i.lastMovementAt) : '—'),
    },
    {
      key: 'actions',
      title: t('common:actions'),
      fixed: 'right',
      width: 90,
      render: (_, i) =>
        can('inventory.movements') && (
          <Button
            type="link"
            icon={<HistoryOutlined />}
            onClick={() => navigate(`/inventory/movements?productId=${i.productId}`)}
          />
        ),
    },
  ];

  const s = summary.data;
  return (
    <div className="b-page">
      <PageHeader
        icon={<DatabaseOutlined />}
        title={t('title')}
        subtitle={t('subtitle')}
        count={list.data?.meta.total}
        actions={
          can('inventory.adjust') && (
            <Button
              type="primary"
              icon={<ToolOutlined />}
              onClick={() => navigate('/inventory/adjustments/new')}
            >
              {t('adjust')}
            </Button>
          )
        }
      />
      <div className="b-stat-grid" style={{ marginBottom: 16 }}>
        <Card>
          <Statistic
            title={t('summary.totalQuantity')}
            value={format.quantity(s?.totalQuantity)}
            loading={summary.isLoading}
          />
        </Card>
        {canViewValue && (
          <Card>
            <Statistic
              title={t('summary.totalValue')}
              value={format.money(s?.totalValue)}
              loading={summary.isLoading}
            />
          </Card>
        )}
        <Card hoverable onClick={() => resetPage(setStockState)('LOW')}>
          <Statistic
            title={t('commerce:stockState.LOW')}
            value={s?.lowCount ?? 0}
            valueStyle={{ color: token.colorWarning }}
            loading={summary.isLoading}
          />
        </Card>
        <Card hoverable onClick={() => resetPage(setStockState)('OUT')}>
          <Statistic
            title={t('commerce:stockState.OUT')}
            value={s?.outCount ?? 0}
            valueStyle={{ color: token.colorError }}
            loading={summary.isLoading}
          />
        </Card>
      </div>
      <Card>
        <div className="b-toolbar">
          <Input.Search
            allowClear
            className="b-toolbar__search"
            placeholder={t('commerce:productSearchPlaceholder')}
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
          />
          <CategorySelect
            allowClear
            style={{ width: 200 }}
            placeholder={t('allCategories')}
            value={categoryId}
            onChange={resetPage(setCategoryId)}
          />
          <Select
            allowClear
            style={{ width: 170 }}
            placeholder={t('stockAll')}
            value={stockState}
            onChange={resetPage(setStockState)}
            options={STOCK_STATES.map((v) => ({ value: v, label: t(`commerce:stockState.${v}`) }))}
          />
          <Select
            allowClear
            style={{ width: 190 }}
            placeholder={t('productStatusAll')}
            value={status}
            onChange={resetPage(setStatus)}
            options={PRODUCT_STATUSES.map((v) => ({
              value: v,
              label: t(`commerce:productStatus.${v}`),
            }))}
          />
          <Space style={{ marginLeft: 'auto' }}>
            {can('inventory.movements') && (
              <Button icon={<HistoryOutlined />} onClick={() => navigate('/inventory/movements')}>
                {t('movements')}
              </Button>
            )}
            {can('inventory.adjustments.list') && (
              <Button icon={<ToolOutlined />} onClick={() => navigate('/inventory/adjustments')}>
                {t('adjustments')}
              </Button>
            )}
          </Space>
        </div>
        <Table<InventoryItemDto>
          rowKey="productId"
          columns={columns}
          dataSource={list.data?.items}
          loading={list.isFetching}
          scroll={{ x: 1200 }}
          locale={{ emptyText: <Empty description={t('empty')} /> }}
          pagination={{
            current: page,
            pageSize,
            total: list.data?.meta.total,
            showSizeChanger: true,
            showTotal: (total) => t('common:total', { count: total }),
          }}
          onChange={(p, _f, sorter) => {
            setPage(p.current ?? 1);
            setPageSize(p.pageSize ?? 20);
            const one = Array.isArray(sorter) ? sorter[0] : sorter;
            setSort(
              one?.order
                ? {
                    sortBy: one.columnKey as ListInventoryQuery['sortBy'],
                    sortOrder: one.order === 'ascend' ? 'asc' : 'desc',
                  }
                : {},
            );
          }}
        />
      </Card>
    </div>
  );
}

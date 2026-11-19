import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import {
  PRODUCT_STATUSES,
  STOCK_STATES,
  type ListProductsQuery,
  type ProductDetailDto,
  type ProductDto,
  type ProductStatus,
  type StockState,
} from '@base/shared';
import {
  PageHeader,
  ProductThumb,
  StockStateTag,
  useApi,
  useAuth,
  useCommerceFormat,
  useDebouncedValue,
  useNotifyError,
} from '@base/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Badge,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Select,
  Skeleton,
  Space,
  Table,
  Tooltip,
  Typography,
  type TableProps,
} from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CategorySelect } from './CategorySelect';
import { ProductFormModal } from './ProductFormModal';
import { ProductImagesManager } from './ProductImagesManager';

function ProductDrawer({
  productId,
  onClose,
  onEdit,
}: {
  productId: string | null;
  onClose: () => void;
  onEdit: (product: ProductDetailDto) => void;
}) {
  const { t } = useTranslation(['products', 'commerce', 'common']);
  const api = useApi();
  const { can } = useAuth();
  const format = useCommerceFormat();
  const product = useQuery({
    queryKey: ['products', 'detail', productId],
    queryFn: () => api.products.get(productId!),
    enabled: Boolean(productId),
    // URL ảnh có hạn 15 phút: tải lại trước khi hết hạn
    staleTime: 5 * 60_000,
  });
  const p = product.data;
  return (
    <Drawer
      open={Boolean(productId)}
      onClose={onClose}
      width={720}
      title={p ? `${p.sku} — ${p.name}` : t('detail')}
      extra={
        p &&
        can('products.update') && (
          <Button icon={<EditOutlined />} onClick={() => onEdit(p)}>
            {t('common:edit')}
          </Button>
        )
      }
    >
      {!p ? (
        <Skeleton active />
      ) : (
        <>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2 }}
            items={[
              { key: 'category', label: t('commerce:category'), children: p.category.name },
              { key: 'unit', label: t('commerce:unit'), children: p.unit },
              {
                key: 'price',
                label: t('commerce:sellingPrice'),
                children: format.money(p.sellingPrice),
              },
              ...(p.purchasePrice !== undefined
                ? [
                    {
                      key: 'purchase',
                      label: t('commerce:purchasePrice'),
                      children: format.money(p.purchasePrice),
                    },
                    { key: 'avg', label: t('commerce:avgCost'), children: format.money(p.avgCost) },
                  ]
                : []),
              {
                key: 'stock',
                label: t('commerce:stock'),
                children: (
                  <Space>
                    {format.quantity(p.stock.quantity)} <StockStateTag state={p.stock.state} />
                  </Space>
                ),
              },
              { key: 'min', label: t('commerce:minStock'), children: format.quantity(p.minStock) },
              {
                key: 'status',
                label: t('common:status'),
                children: t(`commerce:productStatus.${p.status}`),
              },
              {
                key: 'decimal',
                label: t('allowDecimalQuantity'),
                children: p.allowDecimalQuantity ? t('common:yes') : t('common:no'),
              },
              ...(p.description
                ? [
                    {
                      key: 'desc',
                      label: t('common:description'),
                      children: p.description,
                      span: 2,
                    },
                  ]
                : []),
            ]}
          />
          <Typography.Title level={5} style={{ marginTop: 24 }}>
            {t('images.title')}
          </Typography.Title>
          <ProductImagesManager
            productId={p.id}
            images={p.images}
            editable={can('products.update')}
          />
        </>
      )}
    </Drawer>
  );
}

export function ProductsPage() {
  const { t } = useTranslation(['products', 'commerce', 'common']);
  const api = useApi();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { message, modal } = App.useApp();
  const notifyError = useNotifyError();
  const format = useCommerceFormat();
  const canViewCost = can('products.viewCost');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>();
  const [status, setStatus] = useState<ProductStatus>();
  const [stockState, setStockState] = useState<StockState>();
  const [sort, setSort] = useState<Pick<ListProductsQuery, 'sortBy' | 'sortOrder'>>({});
  const [form, setForm] = useState<{ open: boolean; product?: ProductDetailDto }>({ open: false });
  const [viewing, setViewing] = useState<string | null>(null);
  const debounced = useDebouncedValue(search.trim(), 400);

  const query: ListProductsQuery = {
    page,
    pageSize,
    search: debounced || undefined,
    categoryId,
    status,
    stockState,
    ...sort,
  };
  const list = useQuery({
    queryKey: ['products', query],
    queryFn: () => api.products.list(query),
    placeholderData: keepPreviousData,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['products'] });
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const remove = useMutation({
    mutationFn: (p: ProductDto) => api.products.remove(p.id),
    onSuccess: () => {
      void message.success(t('messages.deleted'));
      void invalidate();
    },
    onError: notifyError,
  });

  const columns: TableProps<ProductDto>['columns'] = [
    {
      key: 'product',
      title: t('commerce:product'),
      sorter: true,
      dataIndex: 'name',
      render: (_, p) => (
        <Space>
          <ProductThumb url={p.primaryImage?.url} alt={p.name} />
          <span>
            <Typography.Link strong onClick={() => setViewing(p.id)}>
              {p.name}
            </Typography.Link>
            <br />
            <Typography.Text type="secondary">{p.sku}</Typography.Text>
          </span>
        </Space>
      ),
    },
    {
      key: 'category',
      title: t('commerce:category'),
      width: 160,
      render: (_, p) => p.category.name,
    },
    {
      key: 'sellingPrice',
      dataIndex: 'sellingPrice',
      title: t('commerce:sellingPrice'),
      align: 'right',
      width: 140,
      sorter: true,
      render: (_, p) => format.money(p.sellingPrice),
    },
    ...(canViewCost
      ? ([
          {
            key: 'avgCost',
            title: t('commerce:avgCost'),
            align: 'right',
            width: 140,
            render: (_, p) => format.money(p.avgCost),
          },
        ] satisfies TableProps<ProductDto>['columns'])
      : []),
    {
      key: 'stock',
      dataIndex: 'stock',
      title: t('commerce:stock'),
      align: 'right',
      width: 170,
      sorter: true,
      render: (_, p) => (
        <Space>
          {format.quantity(p.stock.quantity)} {p.unit}
          <StockStateTag state={p.stock.state} />
        </Space>
      ),
    },
    {
      key: 'status',
      title: t('common:status'),
      width: 170,
      render: (_, p) => (
        <Badge
          status={p.status === 'ACTIVE' ? 'success' : 'default'}
          text={t(`commerce:productStatus.${p.status}`)}
        />
      ),
    },
    {
      key: 'actions',
      title: t('common:actions'),
      fixed: 'right',
      align: 'right',
      width: 140,
      render: (_, p) => (
        <Space size={4}>
          <Tooltip title={t('detail')}>
            <Button type="text" icon={<EyeOutlined />} onClick={() => setViewing(p.id)} />
          </Tooltip>
          {can('products.update') && (
            <Tooltip title={t('common:edit')}>
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={async () => {
                  try {
                    setForm({ open: true, product: await api.products.get(p.id) });
                  } catch (err) {
                    notifyError(err);
                  }
                }}
              />
            </Tooltip>
          )}
          {can('products.delete') && (
            <Tooltip title={p.hasTransactions ? t('hasTransactionsHint') : t('common:delete')}>
              <Button
                type="text"
                danger
                disabled={p.hasTransactions}
                icon={<DeleteOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: t('common:deleteConfirmTitle'),
                    content: t('common:deleteConfirmContent', { name: p.name }),
                    okButtonProps: { danger: true },
                    onOk: () => remove.mutateAsync(p),
                  })
                }
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="b-page">
      <PageHeader
        icon={<ShoppingOutlined />}
        title={t('title')}
        subtitle={t('subtitle')}
        count={list.data?.meta.total}
        actions={
          can('products.create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ open: true })}>
              {t('add')}
            </Button>
          )
        }
      />
      <Card>
        <div className="b-toolbar">
          <Input.Search
            allowClear
            className="b-toolbar__search"
            placeholder={t('commerce:productSearchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
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
            style={{ width: 180 }}
            placeholder={t('statusAll')}
            value={status}
            onChange={resetPage(setStatus)}
            options={PRODUCT_STATUSES.map((s) => ({
              value: s,
              label: t(`commerce:productStatus.${s}`),
            }))}
          />
          <Select
            allowClear
            style={{ width: 160 }}
            placeholder={t('stockAll')}
            value={stockState}
            onChange={resetPage(setStockState)}
            options={STOCK_STATES.map((s) => ({ value: s, label: t(`commerce:stockState.${s}`) }))}
          />
        </div>
        <Table<ProductDto>
          rowKey="id"
          columns={columns}
          dataSource={list.data?.items}
          loading={list.isFetching}
          scroll={{ x: 1100 }}
          locale={{
            emptyText: (
              <Empty description={t('empty')}>
                {can('products.create') && (
                  <Button type="primary" onClick={() => setForm({ open: true })}>
                    {t('add')}
                  </Button>
                )}
              </Empty>
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total: list.data?.meta.total,
            showSizeChanger: true,
            showTotal: (total) => t('common:total', { count: total }),
          }}
          onChange={(p, _filters, sorter) => {
            setPage(p.current ?? 1);
            setPageSize(p.pageSize ?? 20);
            const s = Array.isArray(sorter) ? sorter[0] : sorter;
            const field = s?.order ? (s.columnKey as string) : undefined;
            setSort(
              field
                ? {
                    sortBy: (field === 'product' ? 'name' : field) as ListProductsQuery['sortBy'],
                    sortOrder: s?.order === 'ascend' ? 'asc' : 'desc',
                  }
                : {},
            );
          }}
        />
      </Card>
      <ProductFormModal
        open={form.open}
        product={form.product}
        onClose={() => setForm({ open: false })}
        onSaved={(saved) => {
          void invalidate();
          if (!form.product) setViewing(saved.id);
        }}
      />
      <ProductDrawer
        productId={viewing}
        onClose={() => setViewing(null)}
        onEdit={(product) => setForm({ open: true, product })}
      />
    </div>
  );
}

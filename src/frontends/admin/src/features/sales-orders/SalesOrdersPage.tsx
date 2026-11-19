import { CloseOutlined, DollarOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import {
  DOCUMENT_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type DocumentStatus,
  type ListSalesOrdersQuery,
  type PaymentMethod,
  type PaymentStatus,
  type SalesOrderDetailDto,
  type SalesOrderDto,
} from '@base/shared';
import {
  DocumentStatusTag,
  formatDateTime,
  isStaleError,
  PageHeader,
  PaymentStatusTag,
  SalesOrderDetail,
  useApi,
  useAuth,
  useCommerceFormat,
  useDebouncedValue,
  useNotifyError,
} from '@base/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Input,
  Result,
  Select,
  Skeleton,
  Space,
  Table,
  type TableProps,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';

export function SalesOrdersPage() {
  const { t } = useTranslation(['salesOrders', 'commerce', 'common']);
  const api = useApi();
  const format = useCommerceFormat();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<DocumentStatus>();
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const debounced = useDebouncedValue(search.trim(), 400);

  const query: ListSalesOrdersQuery = {
    page,
    pageSize,
    search: debounced || undefined,
    status,
    paymentStatus,
    paymentMethod,
    dateFrom: range?.[0]?.format('YYYY-MM-DD'),
    dateTo: range?.[1]?.format('YYYY-MM-DD'),
  };
  const list = useQuery({
    queryKey: ['sales-orders', query],
    queryFn: () => api.salesOrders.list(query),
    placeholderData: keepPreviousData,
  });
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const columns: TableProps<SalesOrderDto>['columns'] = [
    {
      key: 'code',
      title: t('commerce:orderCode'),
      width: 190,
      render: (_, o) => <Link to={`/sales-orders/${o.id}`}>{o.code}</Link>,
    },
    { key: 'date', title: t('commerce:orderDate'), width: 120, render: (_, o) => o.orderDate },
    {
      key: 'customer',
      title: t('commerce:customer'),
      render: (_, o) => [o.customerName, o.customerPhone].filter(Boolean).join(' · ') || '—',
    },
    {
      key: 'items',
      title: t('itemCount'),
      align: 'right',
      width: 100,
      render: (_, o) => o.itemCount,
    },
    {
      key: 'total',
      title: t('commerce:totalAmount'),
      align: 'right',
      width: 150,
      render: (_, o) => format.money(o.totalAmount),
    },
    {
      key: 'status',
      title: t('common:status'),
      width: 140,
      render: (_, o) => <DocumentStatusTag status={o.status} />,
    },
    {
      key: 'payment',
      title: t('commerce:payment'),
      width: 220,
      render: (_, o) => (
        <Space size={4}>
          {t(`commerce:paymentMethod.${o.paymentMethod}`)}
          <PaymentStatusTag status={o.paymentStatus} />
        </Space>
      ),
    },
    {
      key: 'by',
      title: t('commerce:createdBy'),
      width: 160,
      render: (_, o) => o.createdBy?.name ?? '—',
    },
    {
      key: 'at',
      title: t('commerce:confirmedAt'),
      width: 170,
      render: (_, o) => (o.confirmedAt ? formatDateTime(o.confirmedAt) : '—'),
    },
  ];

  return (
    <div className="b-page">
      <PageHeader
        icon={<ShoppingCartOutlined />}
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
            onChange={(e) => resetPage(setSearch)(e.target.value)}
          />
          <Select
            allowClear
            style={{ width: 160 }}
            placeholder={t('statusAll')}
            value={status}
            onChange={resetPage(setStatus)}
            options={DOCUMENT_STATUSES.map((s) => ({
              value: s,
              label: t(`commerce:documentStatus.${s}`),
            }))}
          />
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder={t('paymentStatusAll')}
            value={paymentStatus}
            onChange={resetPage(setPaymentStatus)}
            options={PAYMENT_STATUSES.map((s) => ({
              value: s,
              label: t(`commerce:paymentStatus.${s}`),
            }))}
          />
          <Select
            allowClear
            style={{ width: 170 }}
            placeholder={t('paymentMethodAll')}
            value={paymentMethod}
            onChange={resetPage(setPaymentMethod)}
            options={PAYMENT_METHODS.map((m) => ({
              value: m,
              label: t(`commerce:paymentMethod.${m}`),
            }))}
          />
          <DatePicker.RangePicker value={range} onChange={resetPage(setRange)} />
        </div>
        <Table<SalesOrderDto>
          rowKey="id"
          columns={columns}
          dataSource={list.data?.items}
          loading={list.isFetching}
          scroll={{ x: 1400 }}
          locale={{ emptyText: <Empty description={t('empty')} /> }}
          onRow={(o) => ({ onDoubleClick: () => navigate(`/sales-orders/${o.id}`) })}
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

/** Chi tiết đơn bán: ghi nhận thanh toán, huỷ (đơn đã chốt cần sales.cancel) */
export function SalesOrderDetailPage() {
  const { t } = useTranslation(['salesOrders', 'commerce', 'common']);
  const { id } = useParams();
  const api = useApi();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const notifyError = useNotifyError();
  const [reason, setReason] = useState('');

  const order = useQuery({
    queryKey: ['sales-orders', 'detail', id],
    queryFn: () => api.salesOrders.get(id!),
  });
  const done = (msg: string) => {
    void message.success(msg);
    void queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['products'] });
  };
  const onError = (err: unknown) => {
    if (isStaleError(err)) void order.refetch();
    notifyError(err);
  };
  const pay = useMutation({
    mutationFn: (o: SalesOrderDetailDto) => api.salesOrders.pay(o.id),
    onSuccess: () => done(t('messages.paid')),
    onError,
  });
  const cancel = useMutation({
    mutationFn: (o: SalesOrderDetailDto) =>
      api.salesOrders.cancel(o.id, { version: o.version, reason: reason.trim() || null }),
    onSuccess: () => done(t('messages.cancelled')),
    onError,
  });

  if (order.isLoading) return <Skeleton active />;
  if (!order.data) return <Result status="404" title={t('notFound')} />;
  const o = order.data;
  const canCancel =
    o.status !== 'CANCELLED' &&
    (o.status === 'CONFIRMED' ? can('sales.cancel') : can('sales.update'));

  return (
    <div className="b-page">
      <PageHeader
        icon={<ShoppingCartOutlined />}
        title={o.code}
        subtitle={o.customerName ?? t('walkInCustomer')}
        actions={
          <Space wrap>
            {o.status === 'CONFIRMED' && o.paymentStatus === 'UNPAID' && can('sales.pay') && (
              <Button
                type="primary"
                icon={<DollarOutlined />}
                loading={pay.isPending}
                onClick={() =>
                  modal.confirm({ title: t('payConfirm'), onOk: () => pay.mutateAsync(o) })
                }
              >
                {t('recordPayment')}
              </Button>
            )}
            {canCancel && (
              <Button
                danger
                icon={<CloseOutlined />}
                loading={cancel.isPending}
                onClick={() =>
                  modal.confirm({
                    title:
                      o.status === 'CONFIRMED' ? t('cancelConfirmedTitle') : t('cancelDraftTitle'),
                    content: (
                      <>
                        {o.status === 'CONFIRMED' && <p>{t('cancelConfirmedContent')}</p>}
                        <Input.TextArea
                          rows={2}
                          placeholder={t('cancelReason')}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </>
                    ),
                    okButtonProps: { danger: true },
                    onOk: () => cancel.mutateAsync(o),
                  })
                }
              >
                {t('cancelOrder')}
              </Button>
            )}
          </Space>
        }
      />
      <Card>
        <SalesOrderDetail order={o} />
      </Card>
    </div>
  );
}

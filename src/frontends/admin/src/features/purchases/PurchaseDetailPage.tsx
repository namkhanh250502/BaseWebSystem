import { CheckOutlined, CloseOutlined, EditOutlined, InboxOutlined } from '@ant-design/icons';
import type { PurchaseReceiptDetailDto } from '@base/shared';
import {
  DocumentStatusTag,
  formatDateTime,
  isStaleError,
  PageHeader,
  useApi,
  useAuth,
  useCommerceFormat,
  useNotifyError,
} from '@base/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Input,
  Result,
  Skeleton,
  Space,
  Table,
  Typography,
} from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

type Item = PurchaseReceiptDetailDto['items'][number];

export function PurchaseDetailPage() {
  const { t } = useTranslation(['purchases', 'commerce', 'common']);
  const { id } = useParams();
  const api = useApi();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const notifyError = useNotifyError();
  const format = useCommerceFormat();
  const [cancelReason, setCancelReason] = useState('');

  const receipt = useQuery({
    queryKey: ['purchases', 'detail', id],
    queryFn: () => api.purchases.get(id!),
  });
  const onError = (err: unknown) => {
    if (isStaleError(err)) {
      void message.warning(t('commerce:staleReload'));
      void receipt.refetch();
    } else notifyError(err);
  };
  const confirm = useMutation({
    mutationFn: (r: PurchaseReceiptDetailDto) => api.purchases.confirm(r.id, r.version),
    onSuccess: () => {
      void message.success(t('messages.confirmed'));
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError,
  });
  const cancel = useMutation({
    mutationFn: (r: PurchaseReceiptDetailDto) =>
      api.purchases.cancel(r.id, { version: r.version, reason: cancelReason.trim() || null }),
    onSuccess: () => {
      void message.success(t('messages.cancelled'));
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
    },
    onError,
  });

  if (receipt.isLoading) return <Skeleton active />;
  if (!receipt.data) return <Result status="404" title={t('notFound')} />;
  const r = receipt.data;
  const isDraft = r.status === 'DRAFT';

  return (
    <div className="b-page">
      <PageHeader
        icon={<InboxOutlined />}
        title={r.code}
        subtitle={r.supplier.name}
        actions={
          isDraft && (
            <Space wrap>
              {can('purchases.update') && (
                <Button icon={<EditOutlined />} onClick={() => navigate(`/purchases/${r.id}/edit`)}>
                  {t('common:edit')}
                </Button>
              )}
              {can('purchases.cancel') && (
                <Button
                  danger
                  icon={<CloseOutlined />}
                  loading={cancel.isPending}
                  onClick={() =>
                    modal.confirm({
                      title: t('cancelConfirm'),
                      content: (
                        <Input.TextArea
                          rows={2}
                          placeholder={t('cancelReason')}
                          onChange={(e) => setCancelReason(e.target.value)}
                        />
                      ),
                      okButtonProps: { danger: true },
                      onOk: () => cancel.mutateAsync(r),
                    })
                  }
                >
                  {t('cancel')}
                </Button>
              )}
              {can('purchases.confirm') && (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={confirm.isPending}
                  onClick={() =>
                    modal.confirm({
                      title: t('confirmTitle'),
                      content: t('confirmContent'),
                      onOk: () => confirm.mutateAsync(r),
                    })
                  }
                >
                  {t('confirm')}
                </Button>
              )}
            </Space>
          )
        }
      />
      {r.status === 'CONFIRMED' && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('immutableHint')} />
      )}
      <Card>
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            {
              key: 'status',
              label: t('common:status'),
              children: <DocumentStatusTag status={r.status} />,
            },
            { key: 'date', label: t('fields.receiptDate'), children: r.receiptDate },
            { key: 'supplier', label: t('commerce:supplier'), children: r.supplier.name },
            {
              key: 'createdBy',
              label: t('commerce:createdBy'),
              children: r.createdBy?.name ?? '—',
            },
            {
              key: 'confirmed',
              label: t('fields.confirmedBy'),
              children: r.confirmedAt
                ? `${r.confirmedBy?.name ?? '—'} · ${formatDateTime(r.confirmedAt)}`
                : '—',
            },
            ...(r.cancelledAt
              ? [
                  {
                    key: 'cancelled',
                    label: t('commerce:cancelledAt'),
                    children: `${formatDateTime(r.cancelledAt)}${r.cancelReason ? ` — ${r.cancelReason}` : ''}`,
                  },
                ]
              : []),
            ...(r.notes ? [{ key: 'notes', label: t('commerce:notes'), children: r.notes }] : []),
          ]}
        />
        <Table<Item>
          rowKey="id"
          size="small"
          style={{ marginTop: 16 }}
          dataSource={r.items}
          pagination={false}
          scroll={{ x: 800 }}
          columns={[
            { key: 'line', title: '#', width: 48, render: (_, i) => i.lineNo },
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
              key: 'qty',
              title: t('commerce:quantity'),
              align: 'right',
              render: (_, i) => `${format.quantity(i.quantity)} ${i.product.unit}`,
            },
            {
              key: 'price',
              title: t('commerce:unitPrice'),
              align: 'right',
              render: (_, i) => format.money(i.unitPrice),
            },
            {
              key: 'discount',
              title: t('commerce:discount'),
              align: 'right',
              render: (_, i) => format.money(i.discountAmount),
            },
            {
              key: 'amount',
              title: t('commerce:lineAmount'),
              align: 'right',
              render: (_, i) => format.money(i.lineAmount),
            },
            ...(can('products.viewCost')
              ? [
                  {
                    key: 'unitCost',
                    title: t('commerce:unitCost'),
                    align: 'right' as const,
                    render: (_: unknown, i: Item) => (i.unitCost ? format.money(i.unitCost) : '—'),
                  },
                ]
              : []),
          ]}
          summary={() => (
            <>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5} align="right">
                  {t('commerce:subtotal')}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  {format.money(r.subtotal)}
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5} align="right">
                  {t('commerce:documentDiscount')}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  {format.money(r.discountAmount)}
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5} align="right">
                  <Typography.Text strong>{t('commerce:totalAmount')}</Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Typography.Text strong>{format.money(r.totalAmount)}</Typography.Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </>
          )}
        />
      </Card>
    </div>
  );
}

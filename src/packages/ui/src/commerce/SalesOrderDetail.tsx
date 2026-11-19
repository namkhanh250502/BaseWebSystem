import type { SalesOrderDetailDto } from '@base/shared';
import { Descriptions, Table, Typography, type TableProps } from 'antd';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../utils';
import { DocumentStatusTag, PaymentStatusTag } from './StatusTags';
import { useCommerceFormat } from './useCommerceFormat';

type Item = SalesOrderDetailDto['items'][number];

/**
 * Chi tiết đơn bán dùng chung admin + app bán hàng. Cột giá vốn / lợi nhuận chỉ hiện khi server
 * trả về (người xem có quyền products.viewCost).
 */
export function SalesOrderDetail({ order }: { order: SalesOrderDetailDto }) {
  const { t } = useTranslation(['commerce', 'common']);
  const format = useCommerceFormat();
  const showCost = order.totalCost !== undefined;
  const columns: TableProps<Item>['columns'] = [
    { key: 'line', title: '#', width: 48, render: (_, i) => i.lineNo },
    {
      key: 'product',
      title: t('product'),
      render: (_, i) => (
        <>
          <Typography.Text strong>{i.sku}</Typography.Text> {i.name}
        </>
      ),
    },
    {
      key: 'qty',
      title: t('quantity'),
      align: 'right',
      render: (_, i) => `${format.quantity(i.quantity)} ${i.unit}`,
    },
    {
      key: 'price',
      title: t('unitPrice'),
      align: 'right',
      render: (_, i) => (
        <>
          {format.money(i.unitPrice)}
          {i.unitPrice !== i.listPrice && (
            <Typography.Text type="secondary" delete style={{ display: 'block' }}>
              {format.money(i.listPrice)}
            </Typography.Text>
          )}
        </>
      ),
    },
    {
      key: 'discount',
      title: t('discount'),
      align: 'right',
      render: (_, i) => format.money(i.discountAmount),
    },
    {
      key: 'amount',
      title: t('lineAmount'),
      align: 'right',
      render: (_, i) => format.money(i.lineAmount),
    },
    ...(showCost
      ? ([
          {
            key: 'cost',
            title: t('costAmount'),
            align: 'right',
            render: (_, i) => (i.costAmount ? format.money(i.costAmount) : '—'),
          },
        ] satisfies TableProps<Item>['columns'])
      : []),
  ];
  return (
    <>
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2, lg: 3 }}
        items={[
          { key: 'code', label: t('orderCode'), children: order.code },
          {
            key: 'status',
            label: t('common:status'),
            children: <DocumentStatusTag status={order.status} />,
          },
          { key: 'date', label: t('orderDate'), children: order.orderDate },
          { key: 'customer', label: t('customer'), children: order.customerName || '—' },
          { key: 'phone', label: t('customerPhone'), children: order.customerPhone || '—' },
          {
            key: 'payment',
            label: t('payment'),
            children: (
              <>
                {t(`paymentMethod.${order.paymentMethod}`)} ·{' '}
                <PaymentStatusTag status={order.paymentStatus} />
              </>
            ),
          },
          { key: 'createdBy', label: t('createdBy'), children: order.createdBy?.name ?? '—' },
          {
            key: 'confirmedAt',
            label: t('confirmedAt'),
            children: order.confirmedAt ? formatDateTime(order.confirmedAt) : '—',
          },
          ...(order.cancelledAt
            ? [
                {
                  key: 'cancelled',
                  label: t('cancelledAt'),
                  children: `${formatDateTime(order.cancelledAt)}${order.cancelReason ? ` — ${order.cancelReason}` : ''}`,
                },
              ]
            : []),
          ...(order.notes ? [{ key: 'notes', label: t('notes'), children: order.notes }] : []),
        ]}
      />
      <Table<Item>
        rowKey="id"
        size="small"
        style={{ marginTop: 16 }}
        columns={columns}
        dataSource={order.items}
        pagination={false}
        scroll={{ x: 720 }}
        summary={() => (
          <>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={5} align="right">
                {t('subtotal')}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                {format.money(order.subtotal)}
              </Table.Summary.Cell>
            </Table.Summary.Row>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={5} align="right">
                {t('orderDiscount')}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                {format.money(order.discountAmount)}
              </Table.Summary.Cell>
            </Table.Summary.Row>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={5} align="right">
                <Typography.Text strong>{t('totalAmount')}</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <Typography.Text strong>{format.money(order.totalAmount)}</Typography.Text>
              </Table.Summary.Cell>
              {showCost && (
                <Table.Summary.Cell index={2} align="right">
                  {format.money(order.totalCost)}
                </Table.Summary.Cell>
              )}
            </Table.Summary.Row>
          </>
        )}
      />
    </>
  );
}

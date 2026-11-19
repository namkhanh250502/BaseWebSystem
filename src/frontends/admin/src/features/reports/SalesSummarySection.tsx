import { WarningOutlined } from '@ant-design/icons';
import type { InventoryItemDto } from '@base/shared';
import { StockStateTag, useApi, useAuth, useCommerceFormat } from '@base/ui';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, List, Row, Statistic, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

function AlertList({
  title,
  items,
  total,
}: {
  title: string;
  items: InventoryItemDto[];
  total: number;
}) {
  const { t } = useTranslation('dashboard');
  const format = useCommerceFormat();
  const { can } = useAuth();
  return (
    <Card
      size="small"
      title={
        <>
          <WarningOutlined /> {title} ({total})
        </>
      }
      extra={can('inventory.list') && <Link to="/inventory">{t('sales.viewInventory')}</Link>}
    >
      <List
        size="small"
        dataSource={items}
        locale={{ emptyText: t('sales.noAlerts') }}
        renderItem={(i) => (
          <List.Item extra={<StockStateTag state={i.state} />}>
            <List.Item.Meta
              title={`${i.sku} — ${i.name}`}
              description={`${t('sales.stockOf', { quantity: format.quantity(i.quantity), min: format.quantity(i.minStock) })} ${i.unit}`}
            />
          </List.Item>
        )}
      />
    </Card>
  );
}

/** Khối tổng quan bán hàng & tồn kho trên Dashboard (quyền dashboard.salesSummary) */
export function SalesSummarySection() {
  const { t } = useTranslation('dashboard');
  const api = useApi();
  const format = useCommerceFormat();
  const summary = useQuery({
    queryKey: ['dashboard', 'sales-summary'],
    queryFn: () => api.dashboard.salesSummary(),
    refetchInterval: 60_000,
  });
  if (summary.isError) return <Alert type="error" showIcon message={t('sales.loadError')} />;
  const s = summary.data;
  const tile = (title: string, value: string | number) => (
    <Card size="small">
      <Statistic title={title} value={value} loading={summary.isLoading} />
    </Card>
  );
  return (
    <>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t('sales.today', { date: s?.today.date ?? '' })}
      </Typography.Title>
      <div className="b-stat-grid" style={{ marginBottom: 16 }}>
        {tile(t('sales.revenueToday'), format.money(s?.today.revenue))}
        {tile(t('sales.ordersToday'), s?.today.orderCount ?? 0)}
        {tile(t('sales.purchasesToday'), format.money(s?.today.purchaseAmount))}
        {tile(t('sales.productCount'), s?.productCount ?? 0)}
        {tile(t('sales.supplierCount'), s?.supplierCount ?? 0)}
        {tile(t('sales.stockQuantity'), format.quantity(s?.totalStockQuantity))}
        {s?.inventoryValue !== undefined &&
          tile(t('sales.inventoryValue'), format.money(s.inventoryValue))}
      </div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <AlertList
            title={t('sales.lowStock')}
            items={s?.lowStock ?? []}
            total={s?.lowStockCount ?? 0}
          />
        </Col>
        <Col xs={24} lg={12}>
          <AlertList
            title={t('sales.outOfStock')}
            items={s?.outOfStock ?? []}
            total={s?.outOfStockCount ?? 0}
          />
        </Col>
      </Row>
    </>
  );
}

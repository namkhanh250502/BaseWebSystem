import { BarChartOutlined } from '@ant-design/icons';
import {
  businessDate,
  REPORT_MAX_RANGE_DAYS,
  SALES_BY_PRODUCT_SORT,
  type ReportRangeQuery,
  type SalesPeriodReport,
} from '@base/shared';
import {
  formatDateTime,
  MovementTypeTag,
  PageHeader,
  ProductSelect,
  useApi,
  useAuth,
  useCommerceFormat,
} from '@base/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card, DatePicker, Empty, Segmented, Statistic, Table, Tabs, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CategorySelect } from '../products/CategorySelect';
import { SupplierSelect } from '../purchases/SupplierSelect';

/** Bảng màu phân loại cố định (đã kiểm tra CVD bằng dataviz validator): doanh thu, giá vốn, lợi nhuận */
const SERIES = { revenue: '#2a78d6', cost: '#eb6834', grossProfit: '#1baf7a' } as const;
const axisProps = { stroke: '#94a3b8', fontSize: 12, tickLine: false, axisLine: false } as const;

/** Doanh thu / giá vốn / lợi nhuận theo kỳ: biểu đồ đường (một trục tiền) + bảng số liệu */
function RevenueTab({ filters }: { filters: ReportRangeQuery }) {
  const { t } = useTranslation(['reports', 'commerce']);
  const api = useApi();
  const format = useCommerceFormat();
  const [granularity, setGranularity] = useState<'day' | 'month'>('day');
  const report = useQuery({
    queryKey: ['reports', 'sales', granularity, filters],
    queryFn: () =>
      granularity === 'day' ? api.reports.salesDaily(filters) : api.reports.salesMonthly(filters),
    placeholderData: keepPreviousData,
  });
  const rows = report.data?.rows ?? [];
  const chartData = rows.map((r) => ({
    period: r.period,
    revenue: Number(r.revenue),
    cost: Number(r.cost),
    grossProfit: Number(r.grossProfit),
  }));
  type Row = SalesPeriodReport['rows'][number];
  return (
    <>
      <div className="b-toolbar">
        <Segmented
          value={granularity}
          onChange={(v) => setGranularity(v as 'day' | 'month')}
          options={[
            { value: 'day', label: t('byDay') },
            { value: 'month', label: t('byMonth') },
          ]}
        />
      </div>
      <div className="b-stat-grid" style={{ marginBottom: 16 }}>
        <Card size="small">
          <Statistic title={t('orderCount')} value={report.data?.totals.orderCount ?? 0} />
        </Card>
        <Card size="small">
          <Statistic title={t('revenue')} value={format.money(report.data?.totals.revenue)} />
        </Card>
        <Card size="small">
          <Statistic title={t('cogs')} value={format.money(report.data?.totals.cost)} />
        </Card>
        <Card size="small">
          <Statistic
            title={t('grossProfit')}
            value={format.money(report.data?.totals.grossProfit)}
          />
        </Card>
      </div>
      {rows.length ? (
        <div style={{ height: 320 }} aria-label={t('revenueChart')}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="period" {...axisProps} />
              <YAxis {...axisProps} width={90} tickFormatter={(v: number) => format.money(v)} />
              <Tooltip formatter={(value) => format.money(Number(value))} />
              <Legend />
              <Line
                type="monotone"
                dataKey="revenue"
                name={t('revenue')}
                stroke={SERIES.revenue}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="cost"
                name={t('cogs')}
                stroke={SERIES.cost}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="grossProfit"
                name={t('grossProfit')}
                stroke={SERIES.grossProfit}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Empty />
      )}
      <Table<Row>
        rowKey="period"
        size="small"
        style={{ marginTop: 16 }}
        loading={report.isFetching}
        dataSource={rows.filter((r) => r.orderCount > 0)}
        pagination={{ pageSize: 31, hideOnSinglePage: true }}
        columns={[
          {
            key: 'period',
            title: granularity === 'day' ? t('commerce:date') : t('month'),
            render: (_, r) => r.period,
          },
          { key: 'orders', title: t('orderCount'), align: 'right', render: (_, r) => r.orderCount },
          {
            key: 'revenue',
            title: t('revenue'),
            align: 'right',
            render: (_, r) => format.money(r.revenue),
          },
          { key: 'cost', title: t('cogs'), align: 'right', render: (_, r) => format.money(r.cost) },
          {
            key: 'profit',
            title: t('grossProfit'),
            align: 'right',
            render: (_, r) => format.money(r.grossProfit),
          },
        ]}
      />
    </>
  );
}

function ByProductTab({ filters }: { filters: ReportRangeQuery }) {
  const { t } = useTranslation(['reports', 'commerce', 'common']);
  const api = useApi();
  const format = useCommerceFormat();
  const [sortBy, setSortBy] = useState<(typeof SALES_BY_PRODUCT_SORT)[number]>('quantity');
  const [page, setPage] = useState(1);
  const report = useQuery({
    queryKey: ['reports', 'by-product', filters, sortBy, page],
    queryFn: () => api.reports.salesByProduct({ ...filters, sortBy, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="b-toolbar">
        <Segmented
          value={sortBy}
          onChange={(v) => {
            setSortBy(v as typeof sortBy);
            setPage(1);
          }}
          options={SALES_BY_PRODUCT_SORT.map((s) => ({ value: s, label: t(`sortBy.${s}`) }))}
        />
      </div>
      <Table
        rowKey={(r) => r.product.id}
        loading={report.isFetching}
        dataSource={report.data?.items}
        scroll={{ x: 900 }}
        pagination={{
          current: page,
          pageSize: 20,
          total: report.data?.meta.total,
          onChange: setPage,
          showTotal: (total) => t('common:total', { count: total }),
        }}
        columns={[
          { key: 'rank', title: '#', width: 56, render: (_, _r, i) => (page - 1) * 20 + i + 1 },
          {
            key: 'product',
            title: t('commerce:product'),
            render: (_, r) => (
              <>
                <Typography.Text strong>{r.product.sku}</Typography.Text> {r.product.name}
              </>
            ),
          },
          { key: 'category', title: t('commerce:category'), render: (_, r) => r.category.name },
          {
            key: 'qty',
            title: t('commerce:quantity'),
            align: 'right',
            render: (_, r) => `${format.quantity(r.quantity)} ${r.product.unit}`,
          },
          {
            key: 'revenue',
            title: t('revenue'),
            align: 'right',
            render: (_, r) => format.money(r.revenue),
          },
          { key: 'cost', title: t('cogs'), align: 'right', render: (_, r) => format.money(r.cost) },
          {
            key: 'profit',
            title: t('grossProfit'),
            align: 'right',
            render: (_, r) => format.money(r.grossProfit),
          },
          {
            key: 'margin',
            title: t('margin'),
            align: 'right',
            render: (_, r) => format.percent(r.marginPct),
          },
        ]}
      />
    </>
  );
}

function ProfitTab({ filters }: { filters: ReportRangeQuery }) {
  const { t } = useTranslation(['reports', 'commerce']);
  const api = useApi();
  const format = useCommerceFormat();
  const report = useQuery({
    queryKey: ['reports', 'profit', filters],
    queryFn: () => api.reports.profit(filters),
    placeholderData: keepPreviousData,
  });
  const p = report.data;
  return (
    <>
      <div className="b-stat-grid" style={{ marginBottom: 16 }}>
        <Card size="small">
          <Statistic title={t('grossSales')} value={format.money(p?.grossSales)} />
        </Card>
        <Card size="small">
          <Statistic title={t('orderDiscounts')} value={format.money(p?.orderDiscounts)} />
        </Card>
        <Card size="small">
          <Statistic title={t('netRevenue')} value={format.money(p?.netRevenue)} />
        </Card>
        <Card size="small">
          <Statistic title={t('cogs')} value={format.money(p?.costOfGoodsSold)} />
        </Card>
        <Card size="small">
          <Statistic title={t('grossProfit')} value={format.money(p?.grossProfit)} />
        </Card>
        <Card size="small">
          <Statistic title={t('margin')} value={format.percent(p?.marginPct)} />
        </Card>
      </div>
      <Typography.Paragraph type="secondary">{t('profitNote')}</Typography.Paragraph>
      <Table
        rowKey="date"
        size="small"
        loading={report.isFetching}
        dataSource={p?.byDay}
        pagination={{ pageSize: 31, hideOnSinglePage: true }}
        columns={[
          { key: 'date', title: t('commerce:date'), render: (_, r) => r.date },
          {
            key: 'net',
            title: t('netRevenue'),
            align: 'right',
            render: (_, r) => format.money(r.netRevenue),
          },
          {
            key: 'cogs',
            title: t('cogs'),
            align: 'right',
            render: (_, r) => format.money(r.costOfGoodsSold),
          },
          {
            key: 'profit',
            title: t('grossProfit'),
            align: 'right',
            render: (_, r) => format.money(r.grossProfit),
          },
        ]}
      />
    </>
  );
}

function PurchasesTab({ filters }: { filters: ReportRangeQuery }) {
  const { t } = useTranslation(['reports', 'commerce']);
  const api = useApi();
  const format = useCommerceFormat();
  const report = useQuery({
    queryKey: ['reports', 'purchases', filters],
    queryFn: () => api.reports.purchases(filters),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="b-stat-grid" style={{ marginBottom: 16 }}>
        <Card size="small">
          <Statistic title={t('receiptCount')} value={report.data?.totals.receiptCount ?? 0} />
        </Card>
        <Card size="small">
          <Statistic
            title={t('purchaseAmount')}
            value={format.money(report.data?.totals.totalAmount)}
          />
        </Card>
      </div>
      <Table
        rowKey={(r) => r.receipt.id}
        size="small"
        loading={report.isFetching}
        dataSource={report.data?.rows}
        columns={[
          {
            key: 'code',
            title: t('commerce:code'),
            render: (_, r) => <Link to={`/purchases/${r.receipt.id}`}>{r.receipt.code}</Link>,
          },
          { key: 'date', title: t('commerce:date'), render: (_, r) => r.receipt.receiptDate },
          { key: 'supplier', title: t('commerce:supplier'), render: (_, r) => r.supplier.name },
          { key: 'items', title: t('itemCount'), align: 'right', render: (_, r) => r.itemCount },
          {
            key: 'total',
            title: t('commerce:totalAmount'),
            align: 'right',
            render: (_, r) => format.money(r.totalAmount),
          },
        ]}
      />
    </>
  );
}

function InventoryTab({ filters }: { filters: ReportRangeQuery }) {
  const { t } = useTranslation(['reports', 'commerce', 'common']);
  const api = useApi();
  const { can } = useAuth();
  const format = useCommerceFormat();
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'balance' | 'movements'>('balance');
  const balance = useQuery({
    queryKey: ['reports', 'inventory', filters, page],
    queryFn: () => api.reports.inventory({ ...filters, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
    enabled: view === 'balance',
  });
  const movements = useQuery({
    queryKey: ['reports', 'inventory-movements', filters, page],
    queryFn: () => api.reports.inventoryMovements({ ...filters, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
    enabled: view === 'movements',
  });
  const pagination = (total?: number) => ({
    current: page,
    pageSize: 20,
    total,
    onChange: setPage,
    showTotal: (n: number) => t('common:total', { count: n }),
  });
  return (
    <>
      <div className="b-toolbar">
        <Segmented
          value={view}
          onChange={(v) => {
            setView(v as typeof view);
            setPage(1);
          }}
          options={[
            { value: 'balance', label: t('inventoryBalance') },
            { value: 'movements', label: t('inventoryMovements') },
          ]}
        />
      </div>
      {view === 'balance' ? (
        <Table
          rowKey={(r) => r.product.id}
          size="small"
          loading={balance.isFetching}
          dataSource={balance.data?.items}
          pagination={pagination(balance.data?.meta.total)}
          scroll={{ x: 900 }}
          columns={[
            {
              key: 'product',
              title: t('commerce:product'),
              render: (_, r) => (
                <>
                  <Typography.Text strong>{r.product.sku}</Typography.Text> {r.product.name}
                </>
              ),
            },
            {
              key: 'opening',
              title: t('opening'),
              align: 'right',
              render: (_, r) => format.quantity(r.openingQty),
            },
            {
              key: 'in',
              title: t('stockIn'),
              align: 'right',
              render: (_, r) => format.quantity(r.inQty),
            },
            {
              key: 'out',
              title: t('stockOut'),
              align: 'right',
              render: (_, r) => format.quantity(r.outQty),
            },
            {
              key: 'closing',
              title: t('closing'),
              align: 'right',
              render: (_, r) => format.quantity(r.closingQty),
            },
            ...(can('inventory.viewValue')
              ? [
                  {
                    key: 'value',
                    title: t('commerce:value'),
                    align: 'right' as const,
                    render: (_: unknown, r: { closingValue?: string }) =>
                      format.money(r.closingValue),
                  },
                ]
              : []),
          ]}
        />
      ) : (
        <Table
          rowKey="id"
          size="small"
          loading={movements.isFetching}
          dataSource={movements.data?.items}
          pagination={pagination(movements.data?.meta.total)}
          scroll={{ x: 900 }}
          columns={[
            {
              key: 'time',
              title: t('commerce:date'),
              render: (_, m) => formatDateTime(m.createdAt),
            },
            {
              key: 'product',
              title: t('commerce:product'),
              render: (_, m) => `${m.product.sku} — ${m.product.name}`,
            },
            {
              key: 'type',
              title: t('movementType'),
              render: (_, m) => <MovementTypeTag type={m.type} />,
            },
            {
              key: 'change',
              title: t('change'),
              align: 'right',
              render: (_, m) => format.quantity(m.quantityChange),
            },
            {
              key: 'after',
              title: t('closing'),
              align: 'right',
              render: (_, m) => format.quantity(m.quantityAfter),
            },
            { key: 'ref', title: t('commerce:code'), render: (_, m) => m.ref.code },
          ]}
        />
      )}
    </>
  );
}

/**
 * Báo cáo: một hàng bộ lọc chung (khoảng ngày, danh mục, sản phẩm, nhà cung cấp) cho mọi tab.
 * Chỉ tính chứng từ đã xác nhận; doanh thu / giá vốn theo ngày chốt đơn (giờ Việt Nam).
 */
export function ReportsPage() {
  const { t } = useTranslation(['reports', 'commerce']);
  const { can } = useAuth();
  const today = dayjs(businessDate());
  const [range, setRange] = useState<[Dayjs, Dayjs]>([today.startOf('month'), today]);
  const [categoryId, setCategoryId] = useState<string>();
  const [productId, setProductId] = useState<string>();
  const [supplierId, setSupplierId] = useState<string>();
  const filters: ReportRangeQuery = {
    dateFrom: range[0].format('YYYY-MM-DD'),
    dateTo: range[1].format('YYYY-MM-DD'),
    categoryId,
    productId,
  };

  const tabs = [
    can('reports.sales') && {
      key: 'revenue',
      label: t('tabs.revenue'),
      children: <RevenueTab filters={filters} />,
    },
    can('reports.sales') && {
      key: 'products',
      label: t('tabs.products'),
      children: <ByProductTab filters={filters} />,
    },
    can('reports.profit') && {
      key: 'profit',
      label: t('tabs.profit'),
      children: <ProfitTab filters={filters} />,
    },
    can('reports.purchases') && {
      key: 'purchases',
      label: t('tabs.purchases'),
      children: <PurchasesTab filters={{ ...filters, supplierId }} />,
    },
    can('reports.inventory') && {
      key: 'inventory',
      label: t('tabs.inventory'),
      children: <InventoryTab filters={filters} />,
    },
  ].filter((tab): tab is { key: string; label: string; children: React.JSX.Element } =>
    Boolean(tab),
  );

  return (
    <div className="b-page">
      <PageHeader icon={<BarChartOutlined />} title={t('title')} subtitle={t('subtitle')} />
      <Card>
        <div className="b-toolbar">
          <DatePicker.RangePicker
            allowClear={false}
            value={range}
            format="DD/MM/YYYY"
            disabledDate={(d) => d.isAfter(today, 'day')}
            onChange={(v) => {
              if (!v?.[0] || !v[1]) return;
              const [from, to] = v as [Dayjs, Dayjs];
              setRange(
                to.diff(from, 'day') + 1 > REPORT_MAX_RANGE_DAYS
                  ? [to.subtract(REPORT_MAX_RANGE_DAYS - 1, 'day'), to]
                  : [from, to],
              );
            }}
            presets={[
              { label: t('presets.today'), value: [today, today] },
              { label: t('presets.last7'), value: [today.subtract(6, 'day'), today] },
              { label: t('presets.thisMonth'), value: [today.startOf('month'), today] },
              {
                label: t('presets.lastMonth'),
                value: [
                  today.subtract(1, 'month').startOf('month'),
                  today.subtract(1, 'month').endOf('month'),
                ],
              },
              { label: t('presets.thisYear'), value: [today.startOf('year'), today] },
            ]}
          />
          <CategorySelect
            allowClear
            style={{ width: 200 }}
            placeholder={t('allCategories')}
            value={categoryId}
            onChange={setCategoryId}
          />
          <ProductSelect
            allowClear
            activeOnly={false}
            style={{ width: 260 }}
            value={productId}
            onChange={(id) => setProductId(id)}
            onClear={() => setProductId(undefined)}
          />
          {can('reports.purchases') && (
            <SupplierSelect
              allowClear
              style={{ width: 220 }}
              placeholder={t('allSuppliers')}
              value={supplierId}
              onChange={setSupplierId}
            />
          )}
        </div>
        <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
          {t('rangeHint', { days: REPORT_MAX_RANGE_DAYS })}
        </Typography.Paragraph>
        {tabs.length ? <Tabs items={tabs} destroyOnHidden /> : <Empty />}
      </Card>
    </div>
  );
}

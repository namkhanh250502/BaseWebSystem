import { InboxOutlined, PlusOutlined } from '@ant-design/icons';
import {
  DOCUMENT_STATUSES,
  type DocumentStatus,
  type ListPurchasesQuery,
  type PurchaseReceiptDto,
} from '@base/shared';
import {
  DocumentStatusTag,
  PageHeader,
  useApi,
  useAuth,
  useCommerceFormat,
  useDebouncedValue,
} from '@base/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, Card, DatePicker, Empty, Input, Select, Table, type TableProps } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { SupplierSelect } from './SupplierSelect';

export function PurchasesPage() {
  const { t } = useTranslation(['purchases', 'commerce', 'common']);
  const api = useApi();
  const { can } = useAuth();
  const format = useCommerceFormat();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [supplierId, setSupplierId] = useState<string>();
  const [status, setStatus] = useState<DocumentStatus>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const debounced = useDebouncedValue(search.trim(), 400);

  const query: ListPurchasesQuery = {
    page,
    pageSize,
    search: debounced || undefined,
    supplierId,
    status,
    dateFrom: range?.[0]?.format('YYYY-MM-DD'),
    dateTo: range?.[1]?.format('YYYY-MM-DD'),
  };
  const list = useQuery({
    queryKey: ['purchases', query],
    queryFn: () => api.purchases.list(query),
    placeholderData: keepPreviousData,
  });

  const columns: TableProps<PurchaseReceiptDto>['columns'] = [
    {
      key: 'code',
      title: t('commerce:code'),
      width: 190,
      render: (_, r) => <Link to={`/purchases/${r.id}`}>{r.code}</Link>,
    },
    { key: 'date', title: t('fields.receiptDate'), width: 130, render: (_, r) => r.receiptDate },
    { key: 'supplier', title: t('commerce:supplier'), render: (_, r) => r.supplier.name },
    {
      key: 'items',
      title: t('fields.itemCount'),
      align: 'right',
      width: 110,
      render: (_, r) => r.itemCount,
    },
    {
      key: 'total',
      title: t('commerce:totalAmount'),
      align: 'right',
      width: 160,
      render: (_, r) => format.money(r.totalAmount),
    },
    {
      key: 'status',
      title: t('common:status'),
      width: 140,
      render: (_, r) => <DocumentStatusTag status={r.status} />,
    },
    {
      key: 'createdBy',
      title: t('commerce:createdBy'),
      width: 180,
      render: (_, r) => r.createdBy?.name ?? '—',
    },
  ];

  return (
    <div className="b-page">
      <PageHeader
        icon={<InboxOutlined />}
        title={t('title')}
        subtitle={t('subtitle')}
        count={list.data?.meta.total}
        actions={
          can('purchases.create') && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/purchases/new')}
            >
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
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <SupplierSelect
            allowClear
            style={{ width: 220 }}
            placeholder={t('allSuppliers')}
            value={supplierId}
            onChange={(v) => {
              setSupplierId(v);
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
        </div>
        <Table<PurchaseReceiptDto>
          rowKey="id"
          columns={columns}
          dataSource={list.data?.items}
          loading={list.isFetching}
          scroll={{ x: 1000 }}
          locale={{ emptyText: <Empty description={t('empty')} /> }}
          onRow={(r) => ({ onDoubleClick: () => navigate(`/purchases/${r.id}`) })}
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

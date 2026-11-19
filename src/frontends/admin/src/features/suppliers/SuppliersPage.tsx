import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import {
  RECORD_STATUSES,
  type CreateSupplierInput,
  type ListSuppliersQuery,
  type RecordStatus,
  type SupplierDto,
} from '@base/shared';
import {
  DocumentStatusTag,
  PageHeader,
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
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tooltip,
  Typography,
  type TableProps,
} from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

function SupplierFormModal({
  open,
  supplier,
  onClose,
  onSaved,
}: {
  open: boolean;
  supplier?: SupplierDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation(['suppliers', 'commerce', 'common']);
  const api = useApi();
  const { message } = App.useApp();
  const notifyError = useNotifyError();
  const [form] = Form.useForm<CreateSupplierInput>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(supplier ?? { status: 'ACTIVE' });
  }, [open, supplier, form]);

  async function submit(values: CreateSupplierInput) {
    setSaving(true);
    try {
      if (supplier) await api.suppliers.update(supplier.id, values);
      else await api.suppliers.create(values);
      void message.success(t(supplier ? 'messages.updated' : 'messages.created'));
      onSaved();
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      width={640}
      title={supplier ? t('edit') : t('add')}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={t('common:save')}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={submit} requiredMark="optional">
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="name"
              label={t('fields.name')}
              rules={[{ required: true, whitespace: true, max: 255 }]}
            >
              <Input autoFocus />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="contactPerson"
              label={t('fields.contactPerson')}
              rules={[{ max: 150 }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="phone" label={t('fields.phone')} rules={[{ max: 30 }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="email" label={t('fields.email')} rules={[{ type: 'email', max: 255 }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="status" label={t('common:status')}>
              <Select
                options={RECORD_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="address" label={t('fields.address')} rules={[{ max: 1000 }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="notes" label={t('commerce:notes')} rules={[{ max: 2000 }]}>
              <Input.TextArea rows={3} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

/** Chi tiết nhà cung cấp: thông tin, tóm tắt nhập (phiếu đã xác nhận), lịch sử phiếu nhập */
function SupplierDrawer({
  supplierId,
  onClose,
}: {
  supplierId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation(['suppliers', 'commerce', 'common']);
  const api = useApi();
  const format = useCommerceFormat();
  const { can } = useAuth();
  const detail = useQuery({
    queryKey: ['suppliers', 'detail', supplierId],
    queryFn: () => api.suppliers.get(supplierId!),
    enabled: Boolean(supplierId),
  });
  const history = useQuery({
    queryKey: ['purchases', { supplierId, pageSize: 50 }],
    queryFn: () => api.purchases.list({ supplierId: supplierId!, pageSize: 50 }),
    enabled: Boolean(supplierId) && can('purchases.list'),
  });
  const s = detail.data;
  return (
    <Drawer open={Boolean(supplierId)} onClose={onClose} width={720} title={s?.name ?? t('detail')}>
      {!s ? (
        <Skeleton active />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Statistic title={t('summary.receiptCount')} value={s.purchaseSummary.receiptCount} />
            </Col>
            <Col span={8}>
              <Statistic
                title={t('summary.totalAmount')}
                value={format.money(s.purchaseSummary.totalConfirmedAmount)}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title={t('summary.lastReceipt')}
                value={s.purchaseSummary.lastReceiptDate ?? '—'}
              />
            </Col>
          </Row>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2 }}
            items={[
              {
                key: 'contact',
                label: t('fields.contactPerson'),
                children: s.contactPerson ?? '—',
              },
              { key: 'phone', label: t('fields.phone'), children: s.phone ?? '—' },
              { key: 'email', label: t('fields.email'), children: s.email ?? '—' },
              { key: 'status', label: t('common:status'), children: t(`statuses.${s.status}`) },
              { key: 'address', label: t('fields.address'), children: s.address ?? '—', span: 2 },
              { key: 'notes', label: t('commerce:notes'), children: s.notes ?? '—', span: 2 },
            ]}
          />
          {can('purchases.list') && (
            <>
              <Typography.Title level={5} style={{ marginTop: 24 }}>
                {t('history')}
              </Typography.Title>
              <Table
                rowKey="id"
                size="small"
                loading={history.isFetching}
                dataSource={history.data?.items}
                pagination={false}
                columns={[
                  {
                    key: 'code',
                    title: t('commerce:code'),
                    render: (_, r) => <Link to={`/purchases/${r.id}`}>{r.code}</Link>,
                  },
                  { key: 'date', title: t('commerce:date'), render: (_, r) => r.receiptDate },
                  {
                    key: 'status',
                    title: t('common:status'),
                    render: (_, r) => <DocumentStatusTag status={r.status} />,
                  },
                  {
                    key: 'total',
                    title: t('commerce:totalAmount'),
                    align: 'right',
                    render: (_, r) => format.money(r.totalAmount),
                  },
                ]}
              />
            </>
          )}
        </>
      )}
    </Drawer>
  );
}

export function SuppliersPage() {
  const { t } = useTranslation(['suppliers', 'commerce', 'common']);
  const api = useApi();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { message, modal } = App.useApp();
  const notifyError = useNotifyError();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RecordStatus>();
  const [form, setForm] = useState<{ open: boolean; supplier?: SupplierDto }>({ open: false });
  const [viewing, setViewing] = useState<string | null>(null);
  const debounced = useDebouncedValue(search.trim(), 400);

  const query: ListSuppliersQuery = { page, pageSize, search: debounced || undefined, status };
  const list = useQuery({
    queryKey: ['suppliers', query],
    queryFn: () => api.suppliers.list(query),
    placeholderData: keepPreviousData,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['suppliers'] });

  const remove = useMutation({
    mutationFn: (s: SupplierDto) => api.suppliers.remove(s.id),
    onSuccess: () => {
      void message.success(t('messages.deleted'));
      void invalidate();
    },
    onError: notifyError,
  });

  const columns: TableProps<SupplierDto>['columns'] = [
    {
      key: 'name',
      title: t('fields.name'),
      render: (_, s) => (
        <Typography.Link strong onClick={() => setViewing(s.id)}>
          {s.name}
        </Typography.Link>
      ),
    },
    {
      key: 'contact',
      title: t('fields.contactPerson'),
      width: 180,
      render: (_, s) => s.contactPerson ?? '—',
    },
    { key: 'phone', title: t('fields.phone'), width: 150, render: (_, s) => s.phone ?? '—' },
    {
      key: 'email',
      title: t('fields.email'),
      width: 220,
      ellipsis: true,
      render: (_, s) => s.email ?? '—',
    },
    {
      key: 'status',
      title: t('common:status'),
      width: 150,
      render: (_, s) => (
        <Badge
          status={s.status === 'ACTIVE' ? 'success' : 'default'}
          text={t(`statuses.${s.status}`)}
        />
      ),
    },
    {
      key: 'actions',
      title: t('common:actions'),
      fixed: 'right',
      align: 'right',
      width: 140,
      render: (_, s) => (
        <Space size={4}>
          <Tooltip title={t('detail')}>
            <Button type="text" icon={<EyeOutlined />} onClick={() => setViewing(s.id)} />
          </Tooltip>
          {can('suppliers.update') && (
            <Tooltip title={t('common:edit')}>
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => setForm({ open: true, supplier: s })}
              />
            </Tooltip>
          )}
          {can('suppliers.delete') && (
            <Tooltip title={t('common:delete')}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: t('common:deleteConfirmTitle'),
                    content: t('common:deleteConfirmContent', { name: s.name }),
                    okButtonProps: { danger: true },
                    onOk: () => remove.mutateAsync(s),
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
        icon={<ShopOutlined />}
        title={t('title')}
        subtitle={t('subtitle')}
        count={list.data?.meta.total}
        actions={
          can('suppliers.create') && (
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
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder={t('statusAll')}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={RECORD_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))}
          />
        </div>
        <Table<SupplierDto>
          rowKey="id"
          columns={columns}
          dataSource={list.data?.items}
          loading={list.isFetching}
          scroll={{ x: 1000 }}
          locale={{ emptyText: <Empty description={t('empty')} /> }}
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
      <SupplierFormModal
        open={form.open}
        supplier={form.supplier}
        onClose={() => setForm({ open: false })}
        onSaved={() => void invalidate()}
      />
      <SupplierDrawer supplierId={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

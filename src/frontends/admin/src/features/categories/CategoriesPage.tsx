import { AppstoreOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  RECORD_STATUSES,
  type CategoryDto,
  type CreateCategoryInput,
  type ListCategoriesQuery,
  type RecordStatus,
} from '@base/shared';
import { PageHeader, useApi, useAuth, useDebouncedValue, useNotifyError } from '@base/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Badge,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
  type TableProps,
} from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

function CategoryFormModal({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean;
  category?: CategoryDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation(['categories', 'commerce', 'common']);
  const api = useApi();
  const { message } = App.useApp();
  const notifyError = useNotifyError();
  const [form] = Form.useForm<CreateCategoryInput>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      category
        ? { name: category.name, description: category.description, status: category.status }
        : { status: 'ACTIVE' },
    );
  }, [open, category, form]);

  async function submit(values: CreateCategoryInput) {
    setSaving(true);
    try {
      if (category) await api.categories.update(category.id, values);
      else await api.categories.create(values);
      void message.success(t(category ? 'messages.updated' : 'messages.created'));
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
      title={category ? t('edit') : t('add')}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={t('common:save')}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={submit} requiredMark="optional">
        <Form.Item
          name="name"
          label={t('commerce:name')}
          rules={[{ required: true, whitespace: true, max: 150 }]}
        >
          <Input autoFocus />
        </Form.Item>
        <Form.Item name="description" label={t('common:description')} rules={[{ max: 2000 }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="status" label={t('common:status')}>
          <Select
            options={RECORD_STATUSES.map((s) => ({
              value: s,
              label: t(`commerce:recordStatus.${s}`),
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function CategoriesPage() {
  const { t } = useTranslation(['categories', 'commerce', 'common']);
  const api = useApi();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { message, modal } = App.useApp();
  const notifyError = useNotifyError();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RecordStatus>();
  const [form, setForm] = useState<{ open: boolean; category?: CategoryDto }>({ open: false });
  const debounced = useDebouncedValue(search.trim(), 400);

  const query: ListCategoriesQuery = { page, pageSize, search: debounced || undefined, status };
  const list = useQuery({
    queryKey: ['categories', query],
    queryFn: () => api.categories.list(query),
    placeholderData: keepPreviousData,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories'] });

  const remove = useMutation({
    mutationFn: (c: CategoryDto) => api.categories.remove(c.id),
    onSuccess: () => {
      void message.success(t('messages.deleted'));
      void invalidate();
    },
    onError: notifyError,
  });

  const columns: TableProps<CategoryDto>['columns'] = [
    {
      key: 'name',
      title: t('commerce:name'),
      render: (_, c) => <Typography.Text strong>{c.name}</Typography.Text>,
    },
    {
      key: 'description',
      title: t('common:description'),
      ellipsis: true,
      render: (_, c) => c.description || <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      key: 'products',
      title: t('productCount'),
      align: 'right',
      width: 140,
      render: (_, c) => c.productCount,
    },
    {
      key: 'status',
      title: t('common:status'),
      width: 150,
      render: (_, c) => (
        <Badge
          status={c.status === 'ACTIVE' ? 'success' : 'default'}
          text={t(`commerce:recordStatus.${c.status}`)}
        />
      ),
    },
    {
      key: 'actions',
      title: t('common:actions'),
      fixed: 'right',
      align: 'right',
      width: 120,
      render: (_, c) => (
        <Space size={4}>
          {can('categories.update') && (
            <Tooltip title={t('common:edit')}>
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => setForm({ open: true, category: c })}
              />
            </Tooltip>
          )}
          {can('categories.delete') && (
            <Tooltip title={c.productCount ? t('inUseHint') : t('common:delete')}>
              <Button
                type="text"
                danger
                disabled={c.productCount > 0}
                icon={<DeleteOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: t('common:deleteConfirmTitle'),
                    content: t('common:deleteConfirmContent', { name: c.name }),
                    okButtonProps: { danger: true },
                    onOk: () => remove.mutateAsync(c),
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
        icon={<AppstoreOutlined />}
        title={t('title')}
        subtitle={t('subtitle')}
        count={list.data?.meta.total}
        actions={
          can('categories.create') && (
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
            options={RECORD_STATUSES.map((s) => ({
              value: s,
              label: t(`commerce:recordStatus.${s}`),
            }))}
          />
        </div>
        <Table<CategoryDto>
          rowKey="id"
          columns={columns}
          dataSource={list.data?.items}
          loading={list.isFetching}
          scroll={{ x: 800 }}
          locale={{
            emptyText: (
              <Empty description={t('empty')}>
                {can('categories.create') && (
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
          onChange={(p) => {
            setPage(p.current ?? 1);
            setPageSize(p.pageSize ?? 20);
          }}
        />
      </Card>
      <CategoryFormModal
        open={form.open}
        category={form.category}
        onClose={() => setForm({ open: false })}
        onSaved={() => void invalidate()}
      />
    </div>
  );
}

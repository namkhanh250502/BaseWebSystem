import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { PERMISSION_KEYS, type ListRolesQuery, type RoleDto } from '@base/shared';
import { PageHeader, useApi, useAuth, useDebouncedValue, useNotifyError } from '@base/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Badge,
  Button,
  Card,
  Input,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  type TableProps,
} from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RoleFormModal } from './RoleFormModal';
import { RolePermissionsDrawer } from './RolePermissionsDrawer';

export function RolesPage() {
  const { t } = useTranslation(['roles', 'common']);
  const api = useApi();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { message, modal } = App.useApp();
  const notifyError = useNotifyError();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<{ open: boolean; role?: RoleDto; cloneFrom?: RoleDto }>({
    open: false,
  });
  const [permRole, setPermRole] = useState<RoleDto | null>(null);
  const debounced = useDebouncedValue(search.trim(), 400);

  const query: ListRolesQuery = { page, pageSize, search: debounced || undefined };
  const roles = useQuery({
    queryKey: ['roles', query],
    queryFn: () => api.roles.list(query),
    placeholderData: keepPreviousData,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roles'] });

  const remove = useMutation({
    mutationFn: (role: RoleDto) => api.roles.remove(role.id),
    onSuccess: () => {
      void message.success(t('messages.deleted'));
      void invalidate();
    },
    onError: notifyError,
  });

  const columns: TableProps<RoleDto>['columns'] = [
    {
      key: 'name',
      title: t('fields.name'),
      width: 240,
      render: (_, r) => (
        <Space size={6}>
          <Typography.Text strong>{r.name}</Typography.Text>
          {r.isSystem && <Tag>{t('system')}</Tag>}
          {r.adminAccess && <Tag color="blue">{t('adminTag')}</Tag>}
        </Space>
      ),
    },
    {
      key: 'description',
      title: t('common:description'),
      render: (_, r) => r.description || <Typography.Text type="secondary">—</Typography.Text>,
      // Không đặt width để cột mô tả nhận phần chiều rộng dư, các cột số giữ gọn
      ellipsis: true,
    },
    {
      key: 'users',
      title: t('columns.users'),
      align: 'right',
      width: 130,
      minWidth: 130,
      render: (_, r) => r.userCount,
    },
    {
      key: 'permissions',
      title: t('columns.permissions'),
      align: 'right',
      width: 130,
      minWidth: 130,
      render: (_, r) => `${r.permissions.length}/${PERMISSION_KEYS.length}`,
    },
    {
      key: 'status',
      title: t('common:status'),
      width: 130,
      minWidth: 130,
      render: (_, r) => (
        <Badge
          status={r.isActive ? 'success' : 'error'}
          text={r.isActive ? t('common:active') : t('common:inactive')}
        />
      ),
    },
    {
      key: 'actions',
      title: t('common:actions'),
      fixed: 'right',
      align: 'right',
      width: 180,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title={t('assignPermissions')}>
            <Button type="text" icon={<KeyOutlined />} onClick={() => setPermRole(r)} />
          </Tooltip>
          {can('roles.create') && (
            <Tooltip title={t('clone')}>
              <Button
                type="text"
                icon={<CopyOutlined />}
                onClick={() => setForm({ open: true, cloneFrom: r })}
              />
            </Tooltip>
          )}
          {can('roles.update') && (
            <Tooltip title={t('common:edit')}>
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => setForm({ open: true, role: r })}
              />
            </Tooltip>
          )}
          {can('roles.delete') && !r.isSystem && (
            <Tooltip title={t('common:delete')}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: t('common:deleteConfirmTitle'),
                    content: t('common:deleteConfirmContent', { name: r.name }),
                    okButtonProps: { danger: true },
                    onOk: () => remove.mutateAsync(r),
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
        icon={<SafetyCertificateOutlined />}
        title={t('title')}
        subtitle={t('subtitle')}
        count={roles.data?.meta.total}
        actions={
          can('roles.create') && (
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
        </div>
        <Table<RoleDto>
          rowKey="id"
          columns={columns}
          dataSource={roles.data?.items}
          loading={roles.isFetching}
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            pageSize,
            total: roles.data?.meta.total,
            showSizeChanger: true,
            showTotal: (total) => t('common:total', { count: total }),
          }}
          onChange={(pagination) => {
            setPage(pagination.current ?? 1);
            setPageSize(pagination.pageSize ?? 20);
          }}
        />
      </Card>
      <RoleFormModal
        open={form.open}
        role={form.role}
        cloneFrom={form.cloneFrom}
        onClose={() => setForm({ open: false })}
        onSaved={() => void invalidate()}
      />
      <RolePermissionsDrawer
        role={permRole}
        readOnly={!can('roles.assignPermissions')}
        onClose={() => setPermRole(null)}
        onSaved={() => void invalidate()}
      />
    </div>
  );
}

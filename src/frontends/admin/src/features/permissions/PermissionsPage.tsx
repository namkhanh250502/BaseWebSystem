import { EditOutlined, KeyOutlined, SyncOutlined } from '@ant-design/icons';
import type { PermissionDto } from '@base/shared';
import { PageHeader, useApi, useAuth } from '@base/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Select, Space, Table, Tag, Tooltip, Typography, type TableProps } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MethodTag } from '@/components/MethodTag';
import { PermissionFormModal } from './PermissionFormModal';
import { SyncPermissionsModal } from './SyncPermissionsModal';

export function PermissionsPage() {
  const { t } = useTranslation(['permissions', 'common']);
  const api = useApi();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [module, setModule] = useState<string | undefined>();
  const [syncOpen, setSyncOpen] = useState(false);
  const [editing, setEditing] = useState<PermissionDto | null>(null);

  const permissions = useQuery({ queryKey: ['permissions'], queryFn: () => api.permissions.list() });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['permissions'] });
    void queryClient.invalidateQueries({ queryKey: ['roles'] });
  };

  const label = (key: string) => t(`items.${key}`, { defaultValue: key });
  const moduleLabel = (m: string) => t(`modules.${m}`, { defaultValue: m });
  const modules = [...new Set(permissions.data?.map((p) => p.module) ?? [])];

  const keyword = search.trim().toLowerCase();
  const rows = permissions.data?.filter(
    (p) =>
      (!module || p.module === module) &&
      (!keyword ||
        [p.key, p.module, p.apiPath ?? '', p.method ?? '', label(p.key), p.description ?? ''].some((v) =>
          v.toLowerCase().includes(keyword),
        )),
  );

  const columns: TableProps<PermissionDto>['columns'] = [
    {
      key: 'module',
      title: t('columns.module'),
      width: 140,
      render: (_, p) => <Tag color="blue">{moduleLabel(p.module)}</Tag>,
    },
    {
      key: 'name',
      title: t('columns.name'),
      width: 280,
      render: (_, p) => (
        <div className="perm-name">
          <Typography.Text>{label(p.key)}</Typography.Text>
          <Space size={4} wrap>
            <Typography.Text code className="perm-name__key">
              {p.key}
            </Typography.Text>
            {p.modified && <Tag color="orange">{t('modified')}</Tag>}
            {!p.defined && <Tag color="warning">{t('stale')}</Tag>}
          </Space>
          {p.description && (
            <Typography.Text type="secondary" className="perm-name__desc">
              {p.description}
            </Typography.Text>
          )}
        </div>
      ),
    },
    {
      key: 'apiPath',
      title: `${t('columns.method')} / ${t('columns.apiPath')}`,
      render: (_, p) =>
        p.apiPath ? (
          <span className="perm-api">
            <MethodTag method={p.method} />
            <Typography.Text className="perm-path" copyable={{ text: p.apiPath }}>
              {p.apiPath}
            </Typography.Text>
          </span>
        ) : (
          <Typography.Text type="secondary">{t('noUrl')}</Typography.Text>
        ),
    },
    {
      key: 'type',
      title: t('columns.type'),
      width: 110,
      responsive: ['xl'],
      render: (_, p) =>
        p.type === 'CLIENT' ? (
          <Tag color="purple">{t('typeClient')}</Tag>
        ) : (
          <Tag color="geekblue">{t('typeServer')}</Tag>
        ),
    },
    {
      key: 'roles',
      title: t('columns.roles'),
      align: 'right',
      width: 110,
      responsive: ['xl'],
      render: (_, p) => p.roleCount,
    },
    {
      key: 'actions',
      title: t('common:actions'),
      align: 'right',
      fixed: 'right',
      width: 90,
      render: (_, p) =>
        can('permissions.update') && (
          <Tooltip title={t('common:edit')}>
            <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(p)} />
          </Tooltip>
        ),
    },
  ];

  return (
    <div className="b-page">
      <PageHeader
        icon={<KeyOutlined />}
        title={t('title')}
        subtitle={t('subtitle')}
        count={permissions.data?.length}
        actions={
          can('permissions.syncPreview') &&
          can('permissions.sync') && (
            <Button icon={<SyncOutlined />} onClick={() => setSyncOpen(true)}>
              {t('sync')}
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
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            allowClear
            style={{ width: 200 }}
            placeholder={t('filterModule')}
            value={module}
            onChange={setModule}
            options={modules.map((m) => ({ value: m, label: moduleLabel(m) }))}
          />
        </div>
        <Table<PermissionDto>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={permissions.isPending}
          pagination={{ pageSize: 50, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: 760 }}
        />
      </Card>
      <PermissionFormModal
        permission={editing}
        modules={modules}
        onClose={() => setEditing(null)}
        onSaved={invalidate}
      />
      <SyncPermissionsModal open={syncOpen} onClose={() => setSyncOpen(false)} onSynced={invalidate} />
    </div>
  );
}

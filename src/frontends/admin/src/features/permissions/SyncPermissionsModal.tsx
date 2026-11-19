import type { PermissionDefinition } from '@base/shared';
import { useApi, useNotifyError } from '@base/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Col,
  Modal,
  Row,
  Spin,
  Statistic,
  Table,
  Typography,
} from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MethodTag } from '@/components/MethodTag';

/** Xem trước khác biệt giữa quyền trong code và DB, rồi áp dụng */
export function SyncPermissionsModal({
  open,
  onClose,
  onSynced,
}: {
  open: boolean;
  onClose: () => void;
  onSynced: () => void;
}) {
  const { t } = useTranslation(['permissions', 'common']);
  const api = useApi();
  const { message, modal } = App.useApp();
  const notifyError = useNotifyError();
  const [removeStale, setRemoveStale] = useState(false);
  const [applying, setApplying] = useState(false);

  const preview = useQuery({
    queryKey: ['permissions', 'sync-preview'],
    queryFn: () => api.permissions.previewSync(),
    enabled: open,
    gcTime: 0,
  });
  const data = preview.data;
  const hasChanges = Boolean(
    data && (data.toAdd.length || data.changes.length || (removeStale && data.toRemove.length)),
  );

  async function apply() {
    setApplying(true);
    try {
      const result = await api.permissions.sync(removeStale);
      void message.success(t('synced', { ...result }));
      onSynced();
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setApplying(false);
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={720}
      title={t('syncTitle')}
      destroyOnHidden
      footer={[
        <Button key="rescan" onClick={() => void preview.refetch()} loading={preview.isFetching}>
          {t('rescan')}
        </Button>,
        <Button
          key="apply"
          type="primary"
          disabled={!hasChanges}
          loading={applying}
          onClick={() =>
            removeStale && data?.toRemove.length
              ? modal.confirm({
                  title: t('common:confirm'),
                  content: t('removeStale'),
                  okButtonProps: { danger: true },
                  onOk: apply,
                })
              : void apply()
          }
        >
          {t('apply')}
        </Button>,
      ]}
    >
      <Typography.Paragraph type="secondary">{t('syncDescription')}</Typography.Paragraph>
      {!data ? (
        <Spin />
      ) : (
        <>
          <Row gutter={16} className="b-mb-16">
            {(['defined', 'unchanged'] as const).map((k) => (
              <Col key={k} span={6}>
                <Statistic title={t(`stats.${k}`)} value={data[k]} />
              </Col>
            ))}
            <Col span={4}>
              <Statistic title={t('stats.toAdd')} value={data.toAdd.length} />
            </Col>
            <Col span={4}>
              <Statistic title={t('stats.changes')} value={data.changes.length} />
            </Col>
            <Col span={4}>
              <Statistic title={t('stats.toRemove')} value={data.toRemove.length} />
            </Col>
          </Row>

          {!data.toAdd.length && !data.changes.length && !data.toRemove.length && (
            <Alert type="success" showIcon title={t('noChanges')} />
          )}

          {data.toAdd.length > 0 && (
            <>
              <Typography.Title level={5}>{t('toAdd')}</Typography.Title>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={data.toAdd}
                className="b-mb-16"
                columns={[
                  {
                    title: t('columns.key'),
                    dataIndex: 'key',
                    render: (v: string) => <code>{v}</code>,
                  },
                  { title: t('columns.module'), dataIndex: 'module' },
                  {
                    title: t('columns.apiPath'),
                    key: 'api',
                    render: (_: unknown, p: PermissionDefinition) =>
                      p.apiPath ? (
                        <span className="admin-perm-api">
                          <MethodTag method={p.method} />
                          <code>{p.apiPath}</code>
                        </span>
                      ) : (
                        '—'
                      ),
                  },
                ]}
              />
            </>
          )}

          {data.changes.length > 0 && (
            <>
              <Typography.Title level={5}>{t('changes')}</Typography.Title>
              <Table
                size="small"
                rowKey={(c) => `${c.key}:${c.field}`}
                pagination={false}
                dataSource={data.changes}
                className="b-mb-16"
                columns={[
                  {
                    title: t('columns.key'),
                    dataIndex: 'key',
                    render: (v: string) => <code>{v}</code>,
                  },
                  {
                    title: t('field'),
                    dataIndex: 'field',
                    render: (v: string) => t(`fields.${v}`),
                  },
                  {
                    title: t('current'),
                    dataIndex: 'from',
                    render: (v: string | null) => <code>{v ?? '—'}</code>,
                  },
                  {
                    title: t('expected'),
                    dataIndex: 'to',
                    render: (v: string | null) => <code>{v ?? '—'}</code>,
                  },
                ]}
              />
            </>
          )}

          {data.toRemove.length > 0 && (
            <>
              <Typography.Title level={5}>{t('toRemove')}</Typography.Title>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={data.toRemove}
                className="b-mb-16"
                columns={[
                  {
                    title: t('columns.key'),
                    dataIndex: 'key',
                    render: (v: string) => <code>{v}</code>,
                  },
                  {
                    title: t('columns.roles'),
                    dataIndex: 'roles',
                    render: (roles: string[]) =>
                      roles.length ? t('assignedTo', { roles: roles.join(', ') }) : '—',
                  },
                ]}
              />
              <Checkbox checked={removeStale} onChange={(e) => setRemoveStale(e.target.checked)}>
                {t('removeStale')}
              </Checkbox>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

import {
  getPermissionDefinition,
  PERMISSION_KEYS,
  PERMISSION_MODULES,
  type PermissionKey,
  type PermissionModule,
  type RoleDto,
} from '@base/shared';
import { useApi, useNotifyError } from '@base/ui';
import { App, Button, Checkbox, Collapse, Drawer, Space, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MethodTag } from '@/components/MethodTag';

const MODULES = Object.keys(PERMISSION_MODULES) as PermissionModule[];

/** Gán quyền cho role: nhóm theo module, chọn cả module hoặc từng quyền */
export function RolePermissionsDrawer({
  role,
  readOnly,
  onClose,
  onSaved,
}: {
  role: RoleDto | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation(['roles', 'permissions', 'common']);
  const api = useApi();
  const { message } = App.useApp();
  const notifyError = useNotifyError();
  const [selected, setSelected] = useState<Set<PermissionKey>>(() => new Set(role?.permissions));
  const [saving, setSaving] = useState(false);
  // Mở drawer cho role khác: nạp lại danh sách quyền đang chọn (điều chỉnh state ngay khi render)
  const [currentRole, setCurrentRole] = useState(role);
  if (role !== currentRole) {
    setCurrentRole(role);
    if (role) setSelected(new Set(role.permissions));
  }

  const toggle = (keys: readonly PermissionKey[], checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  const total = PERMISSION_KEYS.length;

  async function save() {
    if (!role) return;
    setSaving(true);
    try {
      await api.roles.setPermissions(role.id, [...selected]);
      void message.success(t('messages.permissionsSaved'));
      onSaved();
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={Boolean(role)}
      onClose={onClose}
      size={640}
      title={role ? t('assignPermissionsTo', { name: role.name }) : ''}
      destroyOnHidden
      extra={
        !readOnly && (
          <Space>
            <Button onClick={onClose}>{t('common:cancel')}</Button>
            <Button type="primary" loading={saving} onClick={save}>
              {t('common:save')}
            </Button>
          </Space>
        )
      }
    >
      <div className="admin-perm-summary">
        <Typography.Text strong>{t('selected', { count: selected.size, total })}</Typography.Text>
        {!readOnly && (
          <Checkbox
            checked={selected.size === total}
            indeterminate={selected.size > 0 && selected.size < total}
            onChange={(e) => toggle(PERMISSION_KEYS, e.target.checked)}
          >
            {t('selectAll')}
          </Checkbox>
        )}
      </div>
      <Collapse
        defaultActiveKey={MODULES}
        items={MODULES.map((module) => {
          const keys = PERMISSION_MODULES[module];
          const count = keys.filter((k) => selected.has(k)).length;
          return {
            key: module,
            label: (
              <Space>
                <Typography.Text strong>{t(`permissions:modules.${module}`)}</Typography.Text>
                <Typography.Text type="secondary">
                  ({count}/{keys.length})
                </Typography.Text>
              </Space>
            ),
            extra: !readOnly && (
              <Checkbox
                checked={count === keys.length}
                indeterminate={count > 0 && count < keys.length}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => toggle(keys, e.target.checked)}
              />
            ),
            children: (
              <div className="admin-perm-list">
                {keys.map((key) => (
                  <Checkbox
                    key={key}
                    checked={selected.has(key)}
                    disabled={readOnly}
                    onChange={(e) => toggle([key], e.target.checked)}
                  >
                    <span className="admin-perm-row">
                      <span>{t(`permissions:items.${key}`)}</span>
                      <span className="admin-perm-api">
                        {getPermissionDefinition(key)?.apiPath ? (
                          <>
                            <MethodTag method={getPermissionDefinition(key)!.method} />
                            <code>{getPermissionDefinition(key)!.apiPath}</code>
                          </>
                        ) : (
                          <Typography.Text code className="admin-perm-key">
                            {key}
                          </Typography.Text>
                        )}
                      </span>
                    </span>
                  </Checkbox>
                ))}
              </div>
            ),
          };
        })}
      />
    </Drawer>
  );
}

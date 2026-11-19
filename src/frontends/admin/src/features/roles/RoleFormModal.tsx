import { PERMISSION_KEYS, type CreateRoleInput, type RoleDto } from '@base/shared';
import { useApi, useAuth, useNotifyError } from '@base/ui';
import { useQuery } from '@tanstack/react-query';
import { App, Form, Input, Modal, Segmented, Select, Switch } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Mode = 'new' | 'clone';

interface Values {
  mode: Mode;
  cloneFromRoleId?: string;
  name: string;
  description?: string;
  isActive: boolean;
  adminAccess: boolean;
}

/**
 * Modal thêm / sửa role. Khi thêm có thể chọn "Sao chép từ role khác" để role mới
 * nhận sẵn toàn bộ quyền của role nguồn (`cloneFrom` mở modal ở chế độ này).
 */
export function RoleFormModal({
  open,
  role,
  cloneFrom,
  onClose,
  onSaved,
}: {
  open: boolean;
  role?: RoleDto;
  cloneFrom?: RoleDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation(['roles', 'common']);
  const api = useApi();
  const { message } = App.useApp();
  const notifyError = useNotifyError();
  const [form] = Form.useForm<Values>();
  const { can } = useAuth();
  // Cờ vào trang admin = quyền admin.access → cần quyền phân quyền mới được đổi (backend cũng chặn)
  const canSetAdminAccess = can('roles.assignPermissions');
  const [saving, setSaving] = useState(false);
  const mode = Form.useWatch('mode', form);
  const isEdit = !!role;

  // Danh sách role nguồn chỉ tải khi đang ở chế độ sao chép
  const sourceRoles = useQuery({
    queryKey: ['roles', 'clone-options'],
    queryFn: () => api.roles.list({ page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' }),
    enabled: open && !isEdit && mode === 'clone',
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (role) {
      form.setFieldsValue({
        mode: 'new',
        name: role.name,
        description: role.description ?? '',
        isActive: role.isActive,
        adminAccess: role.adminAccess,
      });
    } else if (cloneFrom) {
      form.setFieldsValue({
        mode: 'clone',
        cloneFromRoleId: cloneFrom.id,
        name: t('copyName', { name: cloneFrom.name }),
        description: cloneFrom.description ?? '',
        isActive: true,
        adminAccess: cloneFrom.adminAccess,
      });
    } else {
      form.setFieldsValue({ mode: 'new', isActive: true, adminAccess: false });
    }
  }, [open, role, cloneFrom, form, t]);

  async function submit(values: Values) {
    setSaving(true);
    const input: CreateRoleInput = {
      name: values.name,
      description: values.description?.trim() || null,
      isActive: values.isActive,
      // Chỉ gửi khi được phép và (khi sửa) có thay đổi, để không cần quyền phân quyền khi sửa tên/mô tả
      adminAccess:
        canSetAdminAccess && (!role || values.adminAccess !== role.adminAccess)
          ? values.adminAccess
          : undefined,
    };
    try {
      if (role) {
        await api.roles.update(role.id, input);
      } else {
        await api.roles.create({
          ...input,
          cloneFromRoleId: values.mode === 'clone' ? values.cloneFromRoleId : undefined,
        });
      }
      void message.success(t(role ? 'messages.updated' : 'messages.created'));
      onSaved();
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  // Bảo đảm role được chọn sẵn (nút sao chép trên dòng) luôn có nhãn dù nằm ngoài 100 role đầu
  const options = (sourceRoles.data?.items ?? []).map((r) => ({
    value: r.id,
    label: `${r.name} · ${t('permissionCount', { count: r.permissions.length, total: PERMISSION_KEYS.length })}`,
  }));
  if (cloneFrom && !options.some((o) => o.value === cloneFrom.id)) {
    options.unshift({
      value: cloneFrom.id,
      label: `${cloneFrom.name} · ${t('permissionCount', { count: cloneFrom.permissions.length, total: PERMISSION_KEYS.length })}`,
    });
  }

  return (
    <Modal
      open={open}
      title={isEdit ? t('edit') : t('add')}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={t('common:save')}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form<Values> form={form} layout="vertical" requiredMark={false} onFinish={submit}>
        <Form.Item name="mode" hidden={isEdit}>
          <Segmented<Mode>
            block
            options={[
              { value: 'new', label: t('createMode') },
              { value: 'clone', label: t('cloneMode') },
            ]}
          />
        </Form.Item>
        {!isEdit && mode === 'clone' && (
          <Form.Item
            name="cloneFromRoleId"
            label={t('cloneFromRole')}
            extra={t('cloneFromRoleHint')}
            rules={[{ required: true, message: t('cloneFromRoleRequired') }]}
          >
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              options={options}
              loading={sourceRoles.isFetching}
              placeholder={t('cloneFromRolePlaceholder')}
              onChange={(id: string) => {
                // Cờ admin mặc định theo role nguồn vừa chọn
                const source =
                  sourceRoles.data?.items.find((r) => r.id === id) ??
                  (cloneFrom?.id === id ? cloneFrom : undefined);
                if (source) form.setFieldValue('adminAccess', source.adminAccess);
              }}
            />
          </Form.Item>
        )}
        <Form.Item
          name="name"
          label={t('fields.name')}
          rules={[{ required: true, whitespace: true, max: 100 }]}
        >
          <Input disabled={role?.isSystem} autoFocus />
        </Form.Item>
        <Form.Item name="description" label={t('fields.description')} rules={[{ max: 1000 }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item
          name="isActive"
          label={t('fields.isActive')}
          valuePropName="checked"
          extra={t('inactiveHint')}
        >
          <Switch disabled={role?.isSystem} />
        </Form.Item>
        <Form.Item
          name="adminAccess"
          label={t('fields.adminAccess')}
          valuePropName="checked"
          extra={canSetAdminAccess ? t('adminAccessHint') : t('adminAccessNoPermission')}
        >
          <Switch disabled={!canSetAdminAccess} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

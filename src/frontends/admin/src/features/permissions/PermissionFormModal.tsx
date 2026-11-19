import {
  HTTP_METHODS,
  PERMISSION_TYPES,
  type PermissionDto,
  type UpdatePermissionInput,
} from '@base/shared';
import { useApi, useNotifyError } from '@base/ui';
import { App, AutoComplete, Form, Input, Modal, Select, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Values {
  module: string;
  type: (typeof PERMISSION_TYPES)[number];
  method: (typeof HTTP_METHODS)[number] | null;
  apiPath: string | null;
  description: string | null;
}

/** Sửa quyền: key giữ nguyên (code dùng key để kiểm tra), các trường còn lại sửa được */
export function PermissionFormModal({
  permission,
  modules,
  onClose,
  onSaved,
}: {
  permission: PermissionDto | null;
  modules: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation(['permissions', 'common']);
  const api = useApi();
  const { message } = App.useApp();
  const notifyError = useNotifyError();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const type = Form.useWatch('type', form);

  useEffect(() => {
    if (!permission) return;
    form.setFieldsValue({
      module: permission.module,
      type: permission.type,
      method: permission.method,
      apiPath: permission.apiPath,
      description: permission.description,
    });
  }, [permission, form]);

  async function submit(values: Values) {
    if (!permission) return;
    setSaving(true);
    const input: UpdatePermissionInput = {
      module: values.module.trim(),
      type: values.type,
      method: values.type === 'CLIENT' ? null : (values.method ?? null),
      apiPath: values.type === 'CLIENT' ? null : values.apiPath?.trim() || null,
      description: values.description?.trim() || null,
    };
    try {
      await api.permissions.update(permission.id, input);
      void message.success(t('updated'));
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
      open={Boolean(permission)}
      title={t('edit')}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={t('common:save')}
      confirmLoading={saving}
      forceRender
    >
      <Form<Values> form={form} layout="vertical" requiredMark={false} onFinish={submit}>
        <Form.Item label={t('columns.key')} extra={t('keyHint')}>
          <Input value={permission?.key} disabled className="admin-mono" />
        </Form.Item>
        <Form.Item label={t('columns.name')}>
          <Typography.Text>
            {permission && t(`items.${permission.key}`, { defaultValue: permission.key })}
          </Typography.Text>
        </Form.Item>
        <div className="b-form-grid">
          <Form.Item
            name="module"
            label={t('fields.module')}
            rules={[{ required: true, whitespace: true, max: 50 }]}
          >
            <AutoComplete
              options={modules.map((m) => ({ value: m }))}
              filterOption={(input, option) => String(option?.value).includes(input)}
            />
          </Form.Item>
          <Form.Item name="type" label={t('fields.type')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'SERVER', label: t('typeServer') },
                { value: 'CLIENT', label: t('typeClient') },
              ]}
            />
          </Form.Item>
        </div>
        {type !== 'CLIENT' && (
          <div className="perm-form-api">
            <Form.Item name="method" label={t('fields.method')} rules={[{ required: true }]}>
              <Select options={HTTP_METHODS.map((m) => ({ value: m, label: m }))} />
            </Form.Item>
            <Form.Item
              name="apiPath"
              label={t('fields.apiPath')}
              rules={[
                { required: true, whitespace: true, max: 255 },
                { pattern: /^\//, message: t('fields.apiPath') + ': /…' },
              ]}
            >
              <Input className="admin-mono" placeholder="/api/v1/…" />
            </Form.Item>
          </div>
        )}
        <Form.Item name="description" label={t('fields.description')} rules={[{ max: 1000 }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

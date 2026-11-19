import type { CreateUserInput, RoleDto, UpdateUserInput, UserDto } from '@base/shared';
import { PASSWORD_MIN_LENGTH } from '@base/shared';
import { emailRules, passwordRules, useApi, useAuth, useNotifyError } from '@base/ui';
import { App, Button, Drawer, Form, Input, Select, Space, Switch, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Values {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  roleId: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
}

export interface UserFormDrawerProps {
  open: boolean;
  /** Có user = sửa, không có = tạo mới */
  user?: UserDto;
  roles: RoleDto[];
  onClose: () => void;
  onSaved: () => void;
}

export function UserFormDrawer({ open, user, roles, onClose, onSaved }: UserFormDrawerProps) {
  const { t } = useTranslation(['users', 'common', 'auth']);
  const api = useApi();
  const { user: me } = useAuth();
  const { message } = App.useApp();
  const notifyError = useNotifyError();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(user);
  const isSelf = user?.id === me?.id;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      user
        ? { email: user.email, roleId: user.role?.id ?? null, isSuperAdmin: user.isSuperAdmin }
        : { roleId: null, isActive: true, isSuperAdmin: false },
    );
  }, [open, user, form]);

  async function submit(values: Values) {
    setSaving(true);
    try {
      if (user) {
        // Drawer phân quyền: chỉ sửa vai trò và super admin (thông tin cá nhân sửa ở drawer thông tin, khóa/mở ở bảng)
        const input: UpdateUserInput = {
          roleId: values.roleId ?? null,
          ...(me?.isSuperAdmin && !isSelf ? { isSuperAdmin: values.isSuperAdmin } : {}),
        };
        await api.users.update(user.id, input);
        void message.success(t('messages.updated'));
      } else {
        const input: CreateUserInput = {
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          password: values.password!,
          roleId: values.roleId ?? null,
          isActive: values.isActive,
          isSuperAdmin: me?.isSuperAdmin ? values.isSuperAdmin : false,
        };
        await api.users.create(input);
        void message.success(t('messages.created'));
      }
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
      open={open}
      onClose={onClose}
      size={520}
      title={isEdit ? t('actions.editAccess') : t('add')}
      mask={{ closable: false }}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>{t('common:cancel')}</Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {t('common:save')}
          </Button>
        </Space>
      }
    >
      <Form<Values> form={form} layout="vertical" requiredMark={false} onFinish={submit}>
        <Form.Item
          name="email"
          label={t('fields.email')}
          rules={isEdit ? undefined : emailRules(t)}
        >
          <Input readOnly={isEdit} variant={isEdit ? 'filled' : undefined} autoComplete="off" />
        </Form.Item>
        {!isEdit && (
          <div className="b-form-grid">
            <Form.Item
              name="lastName"
              label={t('fields.lastName')}
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: t('auth:validation.lastNameRequired'),
                },
              ]}
            >
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item
              name="firstName"
              label={t('fields.firstName')}
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: t('auth:validation.firstNameRequired'),
                },
              ]}
            >
              <Input maxLength={100} />
            </Form.Item>
          </div>
        )}
        {!isEdit && (
          <Form.Item
            name="password"
            label={t('fields.password')}
            rules={passwordRules(t)}
            extra={t('auth:passwordHint', { min: PASSWORD_MIN_LENGTH })}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        )}
        <Form.Item name="roleId" label={t('fields.role')}>
          <Select
            allowClear
            showSearch={{ optionFilterProp: 'label' }}
            placeholder={t('noRole')}
            options={roles.map((r) => ({
              value: r.id,
              label: r.name,
              disabled: !r.isActive && r.id !== user?.role?.id,
            }))}
          />
        </Form.Item>
        {!isEdit && (
          <Form.Item name="isActive" label={t('fields.isActive')} valuePropName="checked">
            <Switch />
          </Form.Item>
        )}

        {me?.isSuperAdmin && (
          <div className="admin-danger-zone">
            <Typography.Text strong type="danger">
              {t('dangerZone')}
            </Typography.Text>
            <Form.Item
              name="isSuperAdmin"
              label={t('fields.isSuperAdmin')}
              valuePropName="checked"
              extra={t('fields.isSuperAdminHint')}
              className="b-mt-8"
            >
              <Switch disabled={isSelf} />
            </Form.Item>
          </div>
        )}
      </Form>
    </Drawer>
  );
}

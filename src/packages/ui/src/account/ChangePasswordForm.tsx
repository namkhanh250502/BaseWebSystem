import { PASSWORD_MIN_LENGTH } from '@base/shared';
import { Alert, App, Button, Form, Input } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context';
import { useApi } from '../providers/ApiContext';
import { useNotifyError } from '../hooks';
import { confirmPasswordRules, errorKey, getErrorMessage, passwordRules } from '../utils';

interface Values {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function ChangePasswordForm() {
  const { t } = useTranslation();
  const api = useApi();
  const { message } = App.useApp();
  const notifyError = useNotifyError();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const { user, setUser } = useAuth();
  const hasPassword = user?.hasPassword ?? true;

  async function submit({ currentPassword, newPassword }: Values) {
    setSaving(true);
    try {
      await api.me.changePassword({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      });
      form.resetFields();
      void message.success(t('account:passwordChanged'));
      // Tài khoản Google vừa đặt mật khẩu lần đầu → cập nhật để hiện ô mật khẩu hiện tại
      if (!hasPassword) setUser(await api.auth.me());
    } catch (err) {
      const text = getErrorMessage(err, t);
      // Sai mật khẩu hiện tại: báo lỗi ngay dưới ô nhập
      if (errorKey(err) === 'account.currentPasswordIncorrect') {
        form.setFields([{ name: 'currentPassword', errors: [text] }]);
      } else {
        notifyError(err);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
      {hasPassword ? (
        <Form.Item
          name="currentPassword"
          label={t('account:currentPassword')}
          rules={[{ required: true, message: t('account:currentPasswordRequired') }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
      ) : (
        <Alert type="info" showIcon title={t('account:setPasswordHint')} className="b-mb-16" />
      )}
      <Form.Item
        name="newPassword"
        label={t('account:newPassword')}
        dependencies={['currentPassword']}
        extra={t('auth:passwordHint', { min: PASSWORD_MIN_LENGTH })}
        rules={[
          ...passwordRules(t),
          ({ getFieldValue }) => ({
            validator: (_, value) =>
              value && value === getFieldValue('currentPassword')
                ? Promise.reject(new Error(t('account:samePassword')))
                : Promise.resolve(),
          }),
        ]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Form.Item
        name="confirmPassword"
        label={t('account:confirmNewPassword')}
        dependencies={['newPassword']}
        rules={confirmPasswordRules(t, 'newPassword')}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <div className="b-form-actions">
        <Button type="primary" htmlType="submit" loading={saving}>
          {hasPassword ? t('account:changePassword') : t('account:setPassword')}
        </Button>
      </div>
    </Form>
  );
}

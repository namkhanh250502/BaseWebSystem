import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { PASSWORD_MIN_LENGTH } from '@base/shared';
import { Alert, Button, Form, Input, Result } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useApi } from '../providers/ApiContext';
import { confirmPasswordRules, emailRules, getErrorMessage, passwordRules } from '../utils';

/** Nhập email để nhận link đặt lại mật khẩu */
export function ForgotPasswordForm({ loginPath = '/login' }: { loginPath?: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  if (sentMessage) {
    return (
      <Result
        status="success"
        title={t('auth:forgotPassword.sentTitle')}
        subTitle={sentMessage}
        extra={<Link to={loginPath}>{t('auth:forgotPassword.backToLogin')}</Link>}
      />
    );
  }

  return (
    <Form<{ email: string }>
      layout="vertical"
      requiredMark={false}
      onFinish={async ({ email }) => {
        setLoading(true);
        setError(null);
        try {
          setSentMessage((await api.auth.forgotPassword({ email })).message);
        } catch (err) {
          setError(getErrorMessage(err, t));
        } finally {
          setLoading(false);
        }
      }}
    >
      {error && <Alert type="error" showIcon title={error} className="b-mb-16" />}
      <Form.Item name="email" label={t('auth:email')} rules={emailRules(t)}>
        <Input
          size="large"
          prefix={<MailOutlined />}
          placeholder={t('auth:emailPlaceholder')}
          autoComplete="email"
          autoFocus
        />
      </Form.Item>
      <Button type="primary" htmlType="submit" size="large" block loading={loading}>
        {t('auth:forgotPassword.submit')}
      </Button>
      <div className="b-auth-links">
        <Link to={loginPath}>{t('auth:forgotPassword.backToLogin')}</Link>
      </div>
    </Form>
  );
}

/** Đặt mật khẩu mới từ link trong email (?token=...) */
export function ResetPasswordForm({
  loginPath = '/login',
  forgotPasswordPath = '/forgot-password',
}: {
  loginPath?: string;
  forgotPasswordPath?: string;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!token) {
    return (
      <Result
        status="warning"
        title={t('auth:resetPassword.noToken')}
        extra={<Link to={forgotPasswordPath}>{t('auth:resetPassword.requestNewLink')}</Link>}
      />
    );
  }

  if (done) {
    return (
      <Result
        status="success"
        title={done}
        extra={
          <Button type="primary" onClick={() => navigate(loginPath, { replace: true })}>
            {t('auth:login.submit')}
          </Button>
        }
      />
    );
  }

  return (
    <Form<{ password: string; confirmPassword: string }>
      layout="vertical"
      requiredMark={false}
      onFinish={async ({ password }) => {
        setLoading(true);
        setError(null);
        try {
          setDone((await api.auth.resetPassword({ token, password })).message);
        } catch (err) {
          setError(getErrorMessage(err, t));
        } finally {
          setLoading(false);
        }
      }}
    >
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          className="b-mb-16"
          action={<Link to={forgotPasswordPath}>{t('auth:resetPassword.requestNewLink')}</Link>}
        />
      )}
      <Form.Item
        name="password"
        label={t('auth:resetPassword.newPassword')}
        rules={passwordRules(t)}
        extra={t('auth:passwordHint', { min: PASSWORD_MIN_LENGTH })}
      >
        <Input.Password
          size="large"
          prefix={<LockOutlined />}
          autoComplete="new-password"
          autoFocus
        />
      </Form.Item>
      <Form.Item
        name="confirmPassword"
        label={t('auth:confirmPassword')}
        dependencies={['password']}
        rules={confirmPasswordRules(t, 'password')}
      >
        <Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" size="large" block loading={loading}>
        {t('auth:resetPassword.submit')}
      </Button>
    </Form>
  );
}

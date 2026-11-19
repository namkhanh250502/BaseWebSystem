import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { PASSWORD_MIN_LENGTH, type RegisterInput } from '@base/shared';
import {
  AuthLayout,
  confirmPasswordRules,
  currentLocale,
  emailRules,
  ForgotPasswordForm,
  FullPageSpin,
  getErrorMessage,
  LoginForm,
  passwordRules,
  ResetPasswordForm,
  useApi,
  useAuth,
} from '@base/ui';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { Alert, App, Button, Divider, Form, Input, Result } from 'antd';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { usePublicSettings } from '@/lib/usePublicSettings';

function useBrand() {
  const { t } = useTranslation();
  const settings = usePublicSettings();
  return { settings, brand: settings.data?.site_name || t('common:appName') };
}

export function LoginPage() {
  const { t } = useTranslation();
  const { settings, brand } = useBrand();
  const [step, setStep] = useState<'credentials' | 'verify' | 'setup'>('credentials');
  const title =
    step === 'verify'
      ? t('auth:twoFactor.verifyTitle')
      : step === 'setup'
        ? t('auth:twoFactor.setupTitle')
        : t('auth:login.title');

  return (
    <AuthLayout
      brand={brand}
      title={title}
      subtitle={step === 'credentials' ? t('auth:login.subtitle') : undefined}
    >
      <LoginForm
        onStepChange={setStep}
        google={settings.data?.google_login_enabled}
        footer={
          settings.data?.allow_registration && (
            <div className="b-auth-links">
              {t('auth:login.noAccount')} <Link to="/register">{t('auth:login.registerNow')}</Link>
            </div>
          )
        }
      />
    </AuthLayout>
  );
}

interface RegisterValues extends RegisterInput {
  confirmPassword: string;
}

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const { completeLogin } = useAuth();
  const { message } = App.useApp();
  const { settings, brand } = useBrand();
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (settings.isPending) return <FullPageSpin />;
  const siteKey = settings.data?.turnstile_site_key;

  async function submit({ confirmPassword: _confirm, ...values }: RegisterValues) {
    if (siteKey && !captchaToken) {
      setError(t('auth:validation.captchaRequired'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.auth.register({ ...values, captchaToken: captchaToken ?? undefined });
      if (result.status === 'success') {
        void message.success(t('auth:register.success'));
        completeLogin(result);
      }
    } catch (err) {
      setError(getErrorMessage(err, t));
      // Token captcha chỉ dùng được 1 lần
      turnstileRef.current?.reset();
      setCaptchaToken(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      brand={brand}
      title={t('auth:register.title')}
      subtitle={t('auth:register.subtitle')}
      footer={
        <>
          {t('auth:register.haveAccount')} <Link to="/login">{t('auth:register.loginNow')}</Link>
        </>
      }
    >
      {!settings.data?.allow_registration ? (
        <Result status="info" title={t('auth:register.disabled')} />
      ) : (
        <Form<RegisterValues> layout="vertical" requiredMark={false} onFinish={submit}>
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
          <div className="b-form-grid">
            <Form.Item
              name="lastName"
              label={t('auth:lastName')}
              rules={[{ required: true, whitespace: true, message: t('auth:validation.lastNameRequired') }]}
            >
              <Input size="large" maxLength={100} autoComplete="family-name" />
            </Form.Item>
            <Form.Item
              name="firstName"
              label={t('auth:firstName')}
              rules={[{ required: true, whitespace: true, message: t('auth:validation.firstNameRequired') }]}
            >
              <Input size="large" maxLength={100} autoComplete="given-name" />
            </Form.Item>
          </div>
          <Form.Item
            name="password"
            label={t('auth:password')}
            rules={passwordRules(t)}
            extra={t('auth:passwordHint', { min: PASSWORD_MIN_LENGTH })}
          >
            <Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t('auth:confirmPassword')}
            dependencies={['password']}
            rules={confirmPasswordRules(t, 'password')}
          >
            <Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          {siteKey && (
            <Form.Item>
              <Turnstile
                ref={turnstileRef}
                siteKey={siteKey}
                options={{ theme: 'auto', language: currentLocale(i18n.language) }}
                onSuccess={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)}
                onError={() => setCaptchaToken(null)}
              />
            </Form.Item>
          )}
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={loading}
            disabled={Boolean(siteKey) && !captchaToken}
          >
            {t('auth:register.submit')}
          </Button>
          {settings.data?.google_login_enabled && (
            <>
              <Divider plain className="b-auth-divider">
                {t('auth:login.orContinueWith')}
              </Divider>
              <Button
                size="large"
                block
                onClick={() => {
                  window.location.href = api.auth.googleUrl({ lang: currentLocale(i18n.language) });
                }}
              >
                {t('auth:login.google')}
              </Button>
            </>
          )}
        </Form>
      )}
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { brand } = useBrand();
  return (
    <AuthLayout brand={brand} title={t('auth:forgotPassword.title')} subtitle={t('auth:forgotPassword.subtitle')}>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { brand } = useBrand();
  return (
    <AuthLayout brand={brand} title={t('auth:resetPassword.title')} subtitle={t('auth:resetPassword.subtitle')}>
      <ResetPasswordForm />
    </AuthLayout>
  );
}

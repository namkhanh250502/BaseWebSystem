import { AuthLayout, ForgotPasswordForm, LoginForm, ResetPasswordForm } from '@base/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function LoginPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState<'credentials' | 'verify' | 'setup'>('credentials');
  const title =
    step === 'verify'
      ? t('auth:twoFactor.verifyTitle')
      : step === 'setup'
        ? t('auth:twoFactor.setupTitle')
        : t('auth:login.title');
  return (
    <AuthLayout
      brand={t('menu:brand')}
      title={title}
      subtitle={step === 'credentials' ? t('auth:login.adminSubtitle') : undefined}
    >
      <LoginForm onStepChange={setStep} />
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  return (
    <AuthLayout
      brand={t('menu:brand')}
      title={t('auth:forgotPassword.title')}
      subtitle={t('auth:forgotPassword.subtitle')}
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  return (
    <AuthLayout
      brand={t('menu:brand')}
      title={t('auth:resetPassword.title')}
      subtitle={t('auth:resetPassword.subtitle')}
    >
      <ResetPasswordForm />
    </AuthLayout>
  );
}

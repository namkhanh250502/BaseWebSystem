import { KeyOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import type {
  AuthSession,
  LoginInput,
  LoginResult,
  TwoFactorChallengeInfoDto,
  TwoFactorMethod,
  TwoFactorSetupStartDto,
  TwoFactorVerifyMethod,
} from '@base/shared';
import { Alert, Button, Divider, Form, Input, Spin, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router';
import { currentLocale } from '../i18n/createI18n';
import { useApi } from '../providers/ApiContext';
import { emailRules, errorKey, getErrorMessage } from '../utils';
import { useAuth } from './context';
import { BackupCodesModal } from './BackupCodesModal';
import { EmailCodeEntry, TwoFactorChallenge } from './TwoFactorChallenge';
import { TWO_FACTOR_METHOD_ICONS } from './twoFactorIcons';
import { TwoFactorSetupPanel } from './TwoFactorSetupPanel';
import {
  createPasskey,
  getPasskey,
  isPasskeyCancelled,
  passkeySupported,
  suggestPasskeyName,
} from './webauthn';

type Step =
  | { type: 'credentials' }
  /** info = null: đang tải danh sách phương thức (quay về từ Google) */
  | { type: 'verify'; tempToken: string; info: TwoFactorChallengeInfoDto | null }
  /** Tài khoản admin bắt buộc thiết lập 2FA: chọn phương thức rồi làm theo từng phương thức */
  | {
      type: 'setup';
      tempToken: string;
      allowedMethods: TwoFactorMethod[];
      setup: TwoFactorSetupStartDto | null;
    };

export interface LoginFormProps {
  forgotPasswordPath?: string;
  /** Thay đổi tiêu đề trang theo bước hiện tại */
  onStepChange?: (step: Step['type']) => void;
  footer?: ReactNode;
  /** Hiện nút "Tiếp tục với Google" (khi hệ thống đã cấu hình Google) */
  google?: boolean;
}

/** Biểu tượng Google nhiều màu (không có sẵn trong bộ icon của antd) */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

/**
 * Form đăng nhập đầy đủ: email/mật khẩu → (nếu cần) xác minh 2FA bằng passkey / ứng dụng xác thực /
 * email / mã dự phòng → (nếu tài khoản admin bắt buộc) thiết lập 2FA lần đầu và lưu mã dự phòng.
 */
export function LoginForm({
  forgotPasswordPath = '/forgot-password',
  onStepChange,
  footer,
  google = false,
}: LoginFormProps) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useApi();
  const { completeLogin } = useAuth();
  // Tham số do callback đăng nhập Google gắn vào URL (chỉ đọc 1 lần khi mở trang)
  const [oauth] = useState(() => ({
    twoFactorToken: searchParams.get('twoFactorToken'),
    setupToken: searchParams.get('twoFactorSetupToken'),
    error: searchParams.get('oauthError'),
  }));
  const [step, setStepState] = useState<Step>(() =>
    oauth.twoFactorToken
      ? { type: 'verify', tempToken: oauth.twoFactorToken, info: null }
      : oauth.setupToken
        ? { type: 'setup', tempToken: oauth.setupToken, allowedMethods: [], setup: null }
        : { type: 'credentials' },
  );
  const [error, setError] = useState<string | null>(() =>
    oauth.error
      ? t(`auth:oauthErrors.${oauth.error.split('.').pop()}`, {
          defaultValue: t('auth:oauthErrors.default'),
        })
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<{ session: AuthSession; codes: string[] } | null>(null);

  const setStep = (next: Step) => {
    setStepState(next);
    setError(null);
    onStepChange?.(next.type);
  };

  const finish = (result: LoginResult) => {
    if (result.status !== 'success') return;
    const { backupCodes, ...session } = result;
    // Vừa bật 2FA: giữ phiên lại cho tới khi người dùng xác nhận đã lưu mã dự phòng
    if (backupCodes?.length) setPending({ session, codes: backupCodes });
    else completeLogin(session);
  };

  /** Lỗi ở bước 2FA: token tạm hết hạn thì quay về nhập mật khẩu */
  const handle2faError = (err: unknown) => {
    if (errorKey(err) === 'twoFactor.tokenInvalid') {
      setStep({ type: 'credentials' });
      setError(getErrorMessage(err, t));
    } else if (isPasskeyCancelled(err)) {
      setError(t('auth:twoFactor.passkeyCancelled'));
    } else {
      setError(getErrorMessage(err, t));
    }
  };

  async function run(fn: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      handle2faError(err);
    } finally {
      setLoading(false);
    }
  }

  async function startSetup(
    tempToken: string,
    allowedMethods: TwoFactorMethod[],
    method: TwoFactorMethod,
  ) {
    await run(async () => {
      const setup = await api.auth.setupTwoFactor({ tempToken, method });
      setStepState({ type: 'setup', tempToken, allowedMethods, setup });
    });
  }

  // Quay về từ đăng nhập Google: xoá tham số khỏi URL, báo bước hiện tại cho trang cha,
  // rồi tải danh sách phương thức 2FA (đã bật / được phép thiết lập)
  useEffect(() => {
    if (!oauth.twoFactorToken && !oauth.setupToken && !oauth.error) return;
    setSearchParams({}, { replace: true });
    let cancelled = false;
    const fail = (err: unknown) => {
      if (cancelled) return;
      setStepState({ type: 'credentials' });
      onStepChange?.('credentials');
      setError(getErrorMessage(err, t));
    };
    if (oauth.twoFactorToken) {
      const tempToken = oauth.twoFactorToken;
      onStepChange?.('verify');
      api.auth
        .twoFactorMethods(tempToken)
        .then((info) => !cancelled && setStepState({ type: 'verify', tempToken, info }))
        .catch(fail);
    } else if (oauth.setupToken) {
      const tempToken = oauth.setupToken;
      onStepChange?.('setup');
      api.auth
        .twoFactorSetupMethods(tempToken)
        .then(({ allowedMethods }) => {
          if (cancelled) return;
          setStepState({ type: 'setup', tempToken, allowedMethods, setup: null });
          if (allowedMethods.length === 1)
            void startSetup(tempToken, allowedMethods, allowedMethods[0]!);
        })
        .catch(fail);
    }
    return () => {
      cancelled = true;
    };
    // Chỉ chạy 1 lần khi mở trang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startGoogle = () => {
    const returnTo = (location.state as { from?: string } | null)?.from;
    window.location.href = api.auth.googleUrl({ returnTo, lang: currentLocale(i18n.language) });
  };

  async function submitCredentials(values: LoginInput) {
    setLoading(true);
    setError(null);
    try {
      const result = await api.auth.login(values);
      if (result.status === 'requires2fa') {
        const { tempToken, methods, defaultMethod, emailHint } = result;
        setStep({ type: 'verify', tempToken, info: { methods, defaultMethod, emailHint } });
      } else if (result.status === 'requiresSetup') {
        const { tempToken, allowedMethods } = result;
        setStep({ type: 'setup', tempToken, allowedMethods, setup: null });
        if (allowedMethods.length === 1) {
          const setup = await api.auth.setupTwoFactor({ tempToken, method: allowedMethods[0]! });
          setStepState({ type: 'setup', tempToken, allowedMethods, setup });
        }
      } else finish(result);
    } catch (err) {
      setError(getErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }

  const submitCode = (method: Exclude<TwoFactorVerifyMethod, 'passkey'>, code: string) => {
    if (step.type !== 'verify' || loading) return;
    void run(async () =>
      finish(await api.auth.verifyTwoFactor({ tempToken: step.tempToken, method, code })),
    );
  };

  const submitPasskey = () => {
    if (step.type !== 'verify' || loading) return;
    void run(async () => {
      const options = await api.auth.passkeyLoginOptions(step.tempToken);
      const response = await getPasskey(options);
      finish(await api.auth.verifyPasskeyLogin({ tempToken: step.tempToken, response }));
    });
  };

  const confirmSetup = (code?: string) => {
    if (step.type !== 'setup' || !step.setup || loading) return;
    const { tempToken, setup } = step;
    void run(async () => {
      if (setup.method === 'passkey') {
        const response = await createPasskey(setup.options);
        const name = suggestPasskeyName(t('auth:twoFactor.on'));
        finish(
          await api.auth.confirmTwoFactorSetup({ tempToken, method: 'passkey', response, name }),
        );
      } else {
        finish(await api.auth.confirmTwoFactorSetup({ tempToken, method: setup.method, code }));
      }
    });
  };

  const backToLogin = (
    <Button type="link" block onClick={() => setStep({ type: 'credentials' })}>
      {t('auth:twoFactor.backToLogin')}
    </Button>
  );

  return (
    <>
      {step.type === 'credentials' && (
        <Form<LoginInput> layout="vertical" requiredMark={false} onFinish={submitCredentials}>
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
          <Form.Item
            name="password"
            label={
              <div className="b-label-row">
                <span>{t('auth:password')}</span>
                <Link to={forgotPasswordPath}>{t('auth:login.forgotPassword')}</Link>
              </div>
            }
            rules={[{ required: true, message: t('auth:validation.passwordRequired') }]}
            className="b-label-full"
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder={t('auth:passwordPlaceholder')}
              autoComplete="current-password"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            {t('auth:login.submit')}
          </Button>
          {google && (
            <>
              <Divider plain className="b-auth-divider">
                {t('auth:login.orContinueWith')}
              </Divider>
              <Button size="large" block icon={<GoogleIcon />} onClick={startGoogle}>
                {t('auth:login.google')}
              </Button>
            </>
          )}
          {footer}
        </Form>
      )}

      {step.type === 'verify' &&
        (step.info ? (
          <>
            <TwoFactorChallenge
              methods={step.info.methods}
              defaultMethod={step.info.defaultMethod}
              emailHint={step.info.emailHint}
              loading={loading}
              error={error}
              onSendEmail={() => api.auth.sendTwoFactorEmail(step.tempToken)}
              onSubmitCode={submitCode}
              onPasskey={submitPasskey}
              onMethodChange={() => setError(null)}
            />
            {backToLogin}
          </>
        ) : (
          <div className="b-text-center">
            <Spin />
          </div>
        ))}

      {step.type === 'setup' && (
        <>
          <Alert
            type="info"
            showIcon
            title={t('auth:twoFactor.setupSubtitle')}
            className="b-mb-16"
          />
          {!step.setup ? (
            <div className="b-2fa-others">
              {error && <Alert type="error" showIcon title={error} />}
              <Typography.Text type="secondary">
                {t('auth:twoFactor.chooseSetupMethod')}
              </Typography.Text>
              {step.allowedMethods.length === 0 && <Spin />}
              {step.allowedMethods.map((m) => (
                <Button
                  key={m}
                  size="large"
                  block
                  icon={TWO_FACTOR_METHOD_ICONS[m]}
                  loading={loading}
                  disabled={m === 'passkey' && !passkeySupported()}
                  onClick={() => void startSetup(step.tempToken, step.allowedMethods, m)}
                >
                  {t(`auth:twoFactor.methods.${m}`)}
                </Button>
              ))}
            </div>
          ) : step.setup.method === 'totp' ? (
            <TwoFactorSetupPanel
              setup={step.setup}
              onSubmit={confirmSetup}
              loading={loading}
              error={error}
            />
          ) : step.setup.method === 'email' ? (
            <EmailCodeEntry
              alreadySent
              emailHint={step.setup.emailHint}
              onSend={async () => {
                const sent = await api.auth.setupTwoFactor({
                  tempToken: step.tempToken,
                  method: 'email',
                });
                return sent.method === 'email' ? sent : {};
              }}
              onSubmit={confirmSetup}
              loading={loading}
              error={error}
            />
          ) : (
            <>
              <Typography.Paragraph type="secondary" className="b-text-center">
                {t('auth:twoFactor.passkeySetupSubtitle')}
              </Typography.Paragraph>
              {error && <Alert type="error" showIcon title={error} className="b-mb-16" />}
              <Button
                type="primary"
                size="large"
                block
                icon={<KeyOutlined />}
                loading={loading}
                onClick={() => confirmSetup()}
              >
                {t('auth:twoFactor.createPasskey')}
              </Button>
            </>
          )}
          {step.setup && step.allowedMethods.length > 1 && (
            <Button type="link" block onClick={() => setStep({ ...step, setup: null })}>
              {t('auth:twoFactor.useAnotherMethod')}
            </Button>
          )}
          {backToLogin}
        </>
      )}

      <BackupCodesModal
        codes={pending?.codes ?? null}
        onDone={() => {
          if (pending) completeLogin(pending.session);
          setPending(null);
        }}
      />
    </>
  );
}

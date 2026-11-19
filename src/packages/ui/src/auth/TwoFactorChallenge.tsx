import { KeyOutlined, SafetyOutlined } from '@ant-design/icons';
import {
  TWO_FACTOR_EMAIL_RESEND_SECONDS,
  type TwoFactorMethod,
  type TwoFactorVerifyMethod,
} from '@base/shared';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey, getErrorMessage } from '../utils';
import { TWO_FACTOR_METHOD_ICONS } from './twoFactorIcons';
import { passkeySupported } from './webauthn';

function useCountdown(initial = 0) {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  return [seconds, setSeconds] as const;
}

export interface EmailCodeEntryProps {
  /** Gửi (lại) mã; trả về email đã che và số giây chờ gửi lại */
  onSend: () => Promise<{ emailHint?: string; cooldownSeconds?: number }>;
  onSubmit: (code: string) => void;
  /** Gửi ngay khi hiển thị */
  autoSend?: boolean;
  /** Mã đã được gửi sẵn trước khi hiển thị (bắt đầu đếm ngược) */
  alreadySent?: boolean;
  emailHint?: string;
  loading?: boolean;
  error?: string | null;
  submitText?: string;
}

/** Ô nhập mã 6 số gửi qua email, nút "Gửi lại" đếm ngược 60 giây */
export function EmailCodeEntry({
  onSend,
  onSubmit,
  autoSend = false,
  alreadySent = false,
  emailHint,
  loading,
  error,
  submitText,
}: EmailCodeEntryProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [hint, setHint] = useState(emailHint);
  const [cooldown, setCooldown] = useCountdown(alreadySent ? TWO_FACTOR_EMAIL_RESEND_SECONDS : 0);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(alreadySent);
  const autoSent = useRef(false);

  const send = useCallback(async () => {
    setSending(true);
    setSendError(null);
    try {
      const result = await onSend();
      if (result.emailHint) setHint(result.emailHint);
      setCooldown(result.cooldownSeconds ?? TWO_FACTOR_EMAIL_RESEND_SECONDS);
      setSent(true);
    } catch (err) {
      // Vừa gửi gần đây: không coi là lỗi, chỉ chờ đếm ngược
      if (errorKey(err) === 'twoFactor.emailCooldown') {
        setCooldown(TWO_FACTOR_EMAIL_RESEND_SECONDS);
        setSent(true);
      } else {
        setSendError(getErrorMessage(err, t));
      }
    } finally {
      setSending(false);
    }
  }, [onSend, setCooldown, t]);

  useEffect(() => {
    if (autoSend && !autoSent.current) {
      autoSent.current = true;
      void send();
    }
  }, [autoSend, send]);

  // Mã sai: xoá ô nhập để gõ lại (điều chỉnh state khi prop đổi, không dùng effect)
  const [prevError, setPrevError] = useState(error);
  if (error !== prevError) {
    setPrevError(error);
    if (error) setCode('');
  }

  const shownError = error ?? sendError;
  return (
    <Form layout="vertical" onFinish={() => code.length === 6 && onSubmit(code)}>
      <Typography.Paragraph type="secondary" className="b-text-center">
        {sent
          ? t('auth:twoFactor.emailSent', { email: hint ?? '' })
          : t('auth:twoFactor.emailSending')}
      </Typography.Paragraph>
      {shownError && <Alert type="error" showIcon title={shownError} className="b-mb-16" />}
      <Form.Item className="b-otp-item">
        <Input.OTP
          length={6}
          size="large"
          value={code}
          formatter={(v) => v.replace(/\D/g, '')}
          onChange={(value) => {
            setCode(value);
            if (value.length === 6) onSubmit(value);
          }}
          autoFocus
        />
      </Form.Item>
      <Button
        type="primary"
        htmlType="submit"
        size="large"
        block
        loading={loading}
        disabled={code.length !== 6}
      >
        {submitText ?? t('auth:twoFactor.verify')}
      </Button>
      <Button
        type="link"
        block
        disabled={cooldown > 0}
        loading={sending}
        onClick={() => void send()}
      >
        {cooldown > 0
          ? t('auth:twoFactor.resendIn', { seconds: cooldown })
          : t('auth:twoFactor.resend')}
      </Button>
    </Form>
  );
}

export interface TwoFactorChallengeProps {
  /** Phương thức đang bật của user */
  methods: TwoFactorMethod[];
  defaultMethod: TwoFactorMethod | null;
  emailHint?: string;
  /** Cho phép dùng mã dự phòng */
  allowBackup?: boolean;
  loading?: boolean;
  error?: string | null;
  /** Gửi mã qua email (gọi tự động khi chọn email) */
  onSendEmail: () => Promise<{ emailHint?: string; cooldownSeconds?: number }>;
  onSubmitCode: (method: Exclude<TwoFactorVerifyMethod, 'passkey'>, code: string) => void;
  /** Bắt đầu xác thực bằng passkey (gọi trình duyệt) */
  onPasskey: () => void;
  /** Đổi phương thức: trang cha xoá thông báo lỗi */
  onMethodChange?: (method: TwoFactorVerifyMethod) => void;
}

/**
 * Bước xác minh 2FA dùng chung cho đăng nhập và xác minh lại:
 * hiển thị phương thức mặc định, có "Dùng cách khác" để chuyển sang phương thức còn lại / mã dự phòng.
 */
export function TwoFactorChallenge({
  methods,
  defaultMethod,
  emailHint,
  allowBackup = true,
  loading,
  error,
  onSendEmail,
  onSubmitCode,
  onPasskey,
  onMethodChange,
}: TwoFactorChallengeProps) {
  const { t } = useTranslation();
  const options: TwoFactorVerifyMethod[] = [
    ...methods,
    ...(allowBackup ? (['backup'] as const) : []),
  ];
  const [method, setMethod] = useState<TwoFactorVerifyMethod>(
    () => defaultMethod ?? methods[0] ?? 'backup',
  );
  const [code, setCode] = useState('');
  const [showOthers, setShowOthers] = useState(false);

  const [prevError, setPrevError] = useState(error);
  if (error !== prevError) {
    setPrevError(error);
    if (error) setCode('');
  }

  const choose = (next: TwoFactorVerifyMethod) => {
    setMethod(next);
    setCode('');
    setShowOthers(false);
    onMethodChange?.(next);
  };

  const others = options.filter((m) => m !== method);
  const supported = passkeySupported();

  return (
    <div className="b-2fa-challenge">
      <div className="b-2fa-icon">
        {method === 'totp' ? <SafetyOutlined /> : TWO_FACTOR_METHOD_ICONS[method]}
      </div>

      {method === 'email' ? (
        <EmailCodeEntry
          key="email"
          autoSend
          emailHint={emailHint}
          onSend={onSendEmail}
          onSubmit={(value) => onSubmitCode('email', value)}
          loading={loading}
          error={error}
        />
      ) : method === 'passkey' ? (
        <>
          <Typography.Paragraph type="secondary" className="b-text-center">
            {t('auth:twoFactor.passkeySubtitle')}
          </Typography.Paragraph>
          {error && <Alert type="error" showIcon title={error} className="b-mb-16" />}
          {!supported && (
            <Alert
              type="warning"
              showIcon
              title={t('auth:twoFactor.passkeyUnsupported')}
              className="b-mb-16"
            />
          )}
          <Button
            type="primary"
            size="large"
            block
            icon={<KeyOutlined />}
            loading={loading}
            disabled={!supported}
            onClick={onPasskey}
          >
            {t('auth:twoFactor.usePasskeyButton')}
          </Button>
        </>
      ) : (
        <Form layout="vertical" onFinish={() => onSubmitCode(method, code)}>
          <Typography.Paragraph type="secondary" className="b-text-center">
            {method === 'backup'
              ? t('auth:twoFactor.backupCodeLabel')
              : t('auth:twoFactor.verifySubtitle')}
          </Typography.Paragraph>
          {error && <Alert type="error" showIcon title={error} className="b-mb-16" />}
          <Form.Item className="b-otp-item">
            {method === 'backup' ? (
              <Input
                size="large"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t('auth:twoFactor.backupCodePlaceholder')}
                maxLength={9}
                autoFocus
                className="b-backup-input"
              />
            ) : (
              <Input.OTP
                length={6}
                size="large"
                value={code}
                formatter={(v) => v.replace(/\D/g, '')}
                onChange={(value) => {
                  setCode(value);
                  if (value.length === 6) onSubmitCode(method, value);
                }}
                autoFocus
              />
            )}
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={loading}
            disabled={
              method === 'backup' ? code.replace(/[\s-]/g, '').length < 8 : code.length !== 6
            }
          >
            {t('auth:twoFactor.verify')}
          </Button>
        </Form>
      )}

      {others.length > 0 &&
        (showOthers ? (
          <div className="b-2fa-others">
            <Typography.Text type="secondary">{t('auth:twoFactor.chooseMethod')}</Typography.Text>
            {others.map((m) => (
              <Button key={m} block icon={TWO_FACTOR_METHOD_ICONS[m]} onClick={() => choose(m)}>
                {t(`auth:twoFactor.methods.${m}`)}
              </Button>
            ))}
          </div>
        ) : (
          <Button type="link" block onClick={() => setShowOthers(true)}>
            {t('auth:twoFactor.useAnotherMethod')}
          </Button>
        ))}
    </div>
  );
}

import { EMAIL_VERIFICATION_RESEND_SECONDS, type MeDto } from '@base/shared';
import { Alert, App, Button, Form, Input, Typography } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context';
import { useApi } from '../providers/ApiContext';
import { errorKey, getErrorMessage } from '../utils';

export interface EmailVerificationFormProps {
  /** Gửi mã ngay khi hiển thị (modal ở trang profile). Màn hình sau đăng ký thì mã đã được gửi sẵn. */
  autoSend?: boolean;
  onVerified?: (user: MeDto) => void;
}

/** Nhập mã 6 số gửi tới email; nút "Gửi lại" có đếm ngược 60 giây */
export function EmailVerificationForm({ autoSend = false, onVerified }: EmailVerificationFormProps) {
  const { t } = useTranslation();
  const api = useApi();
  const { user, setUser } = useAuth();
  const { message } = App.useApp();
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(autoSend ? 0 : EMAIL_VERIFICATION_RESEND_SECONDS);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const autoSent = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const send = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const { cooldownSeconds } = await api.me.emailVerification.send();
      setCooldown(cooldownSeconds);
      setInfo(t('account:emailVerification.sent'));
    } catch (err) {
      // Vừa gửi gần đây (ví dụ lúc đăng ký): không coi là lỗi, chỉ chờ đếm ngược
      if (errorKey(err) === 'emailVerification.cooldown') {
        setCooldown(EMAIL_VERIFICATION_RESEND_SECONDS);
        setInfo(getErrorMessage(err, t));
      } else {
        setError(getErrorMessage(err, t));
      }
    } finally {
      setSending(false);
    }
  }, [api, t]);

  useEffect(() => {
    if (autoSend && !autoSent.current) {
      autoSent.current = true;
      void send();
    }
  }, [autoSend, send]);

  async function verify(value: string) {
    if (value.length !== 6 || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const updated = await api.me.emailVerification.verify(value);
      setUser(updated);
      void message.success(t('account:emailVerification.success'));
      onVerified?.(updated);
    } catch (err) {
      setError(getErrorMessage(err, t));
      setCode('');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Form layout="vertical" onFinish={() => void verify(code)} className="b-email-verify">
      <Typography.Paragraph type="secondary">
        {t('account:emailVerification.description', { email: user?.email })}
      </Typography.Paragraph>
      {info && !error && <Alert type="info" showIcon title={info} className="b-mb-16" />}
      {error && <Alert type="error" showIcon title={error} className="b-mb-16" />}
      <Form.Item label={t('account:emailVerification.codeLabel')}>
        <Input.OTP
          length={6}
          size="large"
          value={code}
          formatter={(v) => v.replace(/\D/g, '')}
          onChange={(value) => {
            setCode(value);
            if (value.length === 6) void verify(value);
          }}
          autoFocus
        />
      </Form.Item>
      <div className="b-email-verify__actions">
        <Button type="link" onClick={() => void send()} loading={sending} disabled={cooldown > 0} className="b-px-0">
          {cooldown > 0
            ? t('account:emailVerification.resendIn', { seconds: cooldown })
            : t('account:emailVerification.resend')}
        </Button>
        <Button type="primary" htmlType="submit" loading={verifying} disabled={code.length !== 6}>
          {t('account:emailVerification.submit')}
        </Button>
      </div>
    </Form>
  );
}

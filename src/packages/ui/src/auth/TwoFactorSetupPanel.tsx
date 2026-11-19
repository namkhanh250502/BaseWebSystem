import type { TwoFactorSetupDto } from '@base/shared';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface TwoFactorSetupPanelProps {
  setup: TwoFactorSetupDto;
  onSubmit: (code: string) => void;
  loading?: boolean;
  error?: string | null;
  submitText?: string;
}

/** Bước thiết lập 2FA: quét QR (hoặc nhập khóa) rồi nhập mã 6 số để xác nhận */
export function TwoFactorSetupPanel({
  setup,
  onSubmit,
  loading,
  error,
  submitText,
}: TwoFactorSetupPanelProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');

  return (
    <div className="b-2fa-setup">
      <ol className="b-2fa-setup__steps">
        <li>
          <Typography.Text>{t('account:twoFactor.step1')}</Typography.Text>
          <div className="b-2fa-setup__qr">
            <img src={setup.qrCode} alt="QR code" width={176} height={176} />
          </div>
          <Typography.Text type="secondary">{t('account:twoFactor.manualKey')}</Typography.Text>
          <Typography.Paragraph copyable={{ text: setup.secret }} className="b-2fa-setup__secret">
            <code>{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
          </Typography.Paragraph>
        </li>
        <li>
          <Typography.Text>{t('account:twoFactor.step2')}</Typography.Text>
          <Form
            layout="vertical"
            className="b-2fa-setup__form"
            onFinish={() => code.length === 6 && onSubmit(code)}
          >
            {error && <Alert type="error" showIcon title={error} className="b-mb-16" />}
            <Form.Item label={t('account:twoFactor.codeLabel')} required>
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
            <Button type="primary" htmlType="submit" loading={loading} disabled={code.length !== 6}>
              {submitText ?? t('auth:twoFactor.verify')}
            </Button>
          </Form>
        </li>
      </ol>
    </div>
  );
}

import { MailOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context';
import { AuthLayout } from '../components/AuthLayout';
import { EmailVerificationForm } from './EmailVerificationForm';

/**
 * Màn hình chặn khi hệ thống bắt buộc xác minh email (setting `require_email_verification`)
 * mà tài khoản chưa xác minh. Xác minh xong thì AuthProvider cập nhật user và app hiện bình thường.
 */
export function EmailVerificationScreen() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  return (
    <AuthLayout
      title={
        <span className="b-email-verify__title">
          <MailOutlined /> {t('account:emailVerification.gateTitle')}
        </span>
      }
      subtitle={t('account:emailVerification.gateSubtitle')}
      footer={
        <Button type="link" onClick={() => void logout()}>
          {t('account:emailVerification.useAnotherAccount')}
        </Button>
      }
    >
      <EmailVerificationForm />
    </AuthLayout>
  );
}

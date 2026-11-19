import { KeyOutlined, LockOutlined, MailOutlined, MobileOutlined } from '@ant-design/icons';
import type { TwoFactorVerifyMethod } from '@base/shared';
import type { ReactNode } from 'react';

/** Biểu tượng cho từng cách xác minh 2FA */
export const TWO_FACTOR_METHOD_ICONS: Record<TwoFactorVerifyMethod, ReactNode> = {
  passkey: <KeyOutlined />,
  totp: <MobileOutlined />,
  email: <MailOutlined />,
  backup: <LockOutlined />,
};

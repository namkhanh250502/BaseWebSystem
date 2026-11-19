import type { TwoFactorMethod, TwoFactorStatusDto, TwoFactorVerifyMethod } from '@base/shared';
import { Modal, Typography } from 'antd';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TwoFactorChallenge } from '../auth/TwoFactorChallenge';
import { getPasskey, isPasskeyCancelled } from '../auth/webauthn';
import { useApi } from '../providers/ApiContext';
import { errorKey, getErrorMessage } from '../utils';

/** Người dùng đóng hộp thoại xác minh lại */
export class ReauthCancelledError extends Error {
  constructor() {
    super('reauth-cancelled');
    this.name = 'ReauthCancelledError';
  }
}

export function enabledMethodsOf(status: TwoFactorStatusDto | undefined): TwoFactorMethod[] {
  if (!status) return [];
  const methods: TwoFactorMethod[] = [];
  if (status.passkeys.length) methods.push('passkey');
  if (status.totp.enabled) methods.push('totp');
  if (status.email.enabled) methods.push('email');
  return methods;
}

/**
 * Bọc thao tác nhạy cảm cần xác minh lại (step-up): nếu 2FA đang bật mà chưa có token còn hạn
 * thì mở hộp thoại xác minh trước; server vẫn báo `twoFactor.reauthRequired` thì hỏi lại 1 lần.
 */
export function useReauth(status: TwoFactorStatusDto | undefined) {
  const { t } = useTranslation();
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setError(null);
        setOpen(true);
      }),
    [],
  );

  const withReauth = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      if (status?.enabled && !api.me.twoFactor.hasValidReauth()) await ask();
      try {
        return await fn();
      } catch (err) {
        if (errorKey(err) !== 'twoFactor.reauthRequired') throw err;
        api.me.twoFactor.clearReauth();
        await ask();
        return fn();
      }
    },
    [api, ask, status?.enabled],
  );

  const succeed = () => {
    setOpen(false);
    pending.current?.resolve();
    pending.current = null;
  };

  const cancel = () => {
    setOpen(false);
    pending.current?.reject(new ReauthCancelledError());
    pending.current = null;
  };

  async function attempt(fn: () => Promise<unknown>) {
    setLoading(true);
    setError(null);
    try {
      await fn();
      succeed();
    } catch (err) {
      setError(
        isPasskeyCancelled(err) ? t('auth:twoFactor.passkeyCancelled') : getErrorMessage(err, t),
      );
    } finally {
      setLoading(false);
    }
  }

  const methods = enabledMethodsOf(status);
  const modal = (
    <Modal
      open={open}
      title={t('account:twoFactor.reauthTitle')}
      onCancel={cancel}
      footer={null}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        {t('account:twoFactor.reauthDescription')}
      </Typography.Paragraph>
      <TwoFactorChallenge
        methods={methods}
        defaultMethod={status?.defaultMethod ?? null}
        emailHint={status?.email.emailHint}
        loading={loading}
        error={error}
        onMethodChange={() => setError(null)}
        onSendEmail={() => api.me.twoFactor.prepareReauth('email')}
        onSubmitCode={(method: Exclude<TwoFactorVerifyMethod, 'passkey'>, code) =>
          void attempt(() => api.me.twoFactor.reauth({ method, code }))
        }
        onPasskey={() =>
          void attempt(async () => {
            const { options } = await api.me.twoFactor.prepareReauth('passkey');
            const response = await getPasskey(options!);
            await api.me.twoFactor.reauth({ method: 'passkey', response });
          })
        }
      />
    </Modal>
  );

  return { withReauth, modal };
}

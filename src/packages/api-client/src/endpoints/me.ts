import {
  REAUTH_HEADER,
  type AddPasskeyInput,
  type BackupCodesDto,
  type ChangePasswordInput,
  type DisableTwoFactorInput,
  type EmailVerificationSentDto,
  type ListLoginHistoryQuery,
  type ListNotificationsQuery,
  type LoginHistoryDto,
  type MeDto,
  type NotificationDto,
  type PasskeyAddedDto,
  type PasskeyDto,
  type ReauthInput,
  type ReauthTokenDto,
  type TwoFactorEnabledDto,
  type TwoFactorMethod,
  type TwoFactorPrepareDto,
  type TwoFactorSetupDto,
  type TwoFactorStatusDto,
  type WebAuthnOptionsJSON,
  type UnreadCountDto,
  type UpdateProfileInput,
} from '@base/shared';
import { toPaginated, type HttpClient } from '../http';

/** API của user đang đăng nhập: profile, bảo mật, thông báo */
export function createMeApi(http: HttpClient) {
  /** Token xác minh lại (5 phút) dùng cho thao tác 2FA nhạy cảm, tự gắn vào header */
  let reauth: { token: string; expiresAt: number } | null = null;
  const reauthHeaders = (): Record<string, string> =>
    reauth && reauth.expiresAt > Date.now() ? { [REAUTH_HEADER]: reauth.token } : {};
  const withReauth = {
    get headers() {
      return reauthHeaders();
    },
  };

  return {
    emailVerification: {
      /** Gửi mã 6 số tới email; trả về số giây phải chờ trước khi gửi lại */
      send: async () =>
        (await http.post<EmailVerificationSentDto>('/me/email-verification/send')).data,
      verify: async (code: string) =>
        (await http.post<MeDto>('/me/email-verification/verify', { code })).data,
    },

    updateProfile: async (input: UpdateProfileInput) =>
      (await http.patch<MeDto>('/me', input)).data,
    uploadAvatar: async (file: Blob, fileName = 'avatar.png') => {
      const form = new FormData();
      form.append('file', file, fileName);
      return (await http.post<MeDto>('/me/avatar', form)).data;
    },
    removeAvatar: async () => (await http.delete<MeDto>('/me/avatar')).data,
    changePassword: async (input: ChangePasswordInput) => {
      await http.post('/me/change-password', input);
    },

    /**
     * Xác thực 2 lớp. Các hàm đánh dấu (reauth) cần xác minh lại khi 2FA đang bật:
     * server trả lỗi key `twoFactor.reauthRequired` → gọi `prepareReauth` / `reauth` rồi thử lại.
     */
    twoFactor: {
      status: async () => (await http.get<TwoFactorStatusDto>('/me/2fa')).data,
      prepareReauth: async (method: TwoFactorMethod) =>
        (await http.post<TwoFactorPrepareDto>('/me/2fa/reauth/prepare', { method })).data,
      /** Xác minh lại; token được lưu trong client và tự gắn vào các request (reauth) */
      reauth: async (input: ReauthInput) => {
        const data = (await http.post<ReauthTokenDto>('/me/2fa/reauth', input)).data;
        reauth = { token: data.reauthToken, expiresAt: Date.now() + (data.expiresIn - 10) * 1000 };
        return data;
      },
      hasValidReauth: () => reauth !== null && reauth.expiresAt > Date.now(),
      clearReauth: () => {
        reauth = null;
      },

      /** (reauth) */
      totpSetup: async () =>
        (await http.post<TwoFactorSetupDto>('/me/2fa/totp/setup', undefined, withReauth)).data,
      /** (reauth) */
      totpEnable: async (code: string) =>
        (await http.post<TwoFactorEnabledDto>('/me/2fa/totp/enable', { code }, withReauth)).data,
      /** (reauth) */
      totpDisable: async () => {
        await http.delete('/me/2fa/totp', withReauth);
      },

      /** (reauth) */
      emailSend: async () =>
        (
          await http.post<{ emailHint: string; cooldownSeconds: number }>(
            '/me/2fa/email/send',
            undefined,
            withReauth,
          )
        ).data,
      /** (reauth) */
      emailEnable: async (code: string) =>
        (await http.post<TwoFactorEnabledDto>('/me/2fa/email/enable', { code }, withReauth)).data,
      /** (reauth) */
      emailDisable: async () => {
        await http.delete('/me/2fa/email', withReauth);
      },

      /** (reauth) */
      passkeyOptions: async () =>
        (await http.post<WebAuthnOptionsJSON>('/me/2fa/passkeys/options', undefined, withReauth))
          .data,
      /** (reauth) */
      passkeyAdd: async (input: AddPasskeyInput) =>
        (await http.post<PasskeyAddedDto>('/me/2fa/passkeys', input, withReauth)).data,
      passkeyRename: async (id: string, name: string) =>
        (await http.patch<PasskeyDto>(`/me/2fa/passkeys/${id}`, { name })).data,
      /** (reauth) */
      passkeyRemove: async (id: string) => {
        await http.delete(`/me/2fa/passkeys/${id}`, withReauth);
      },

      setDefaultMethod: async (method: TwoFactorMethod) => {
        await http.put('/me/2fa/default-method', { method });
      },
      /** (reauth) */
      regenerateBackupCodes: async () =>
        (await http.post<BackupCodesDto>('/me/2fa/backup-codes', undefined, withReauth)).data,
      /** (reauth) Tắt toàn bộ 2FA */
      disable: async (input: DisableTwoFactorInput) => {
        await http.post('/me/2fa/disable', input, withReauth);
        reauth = null;
      },
    },

    /** Lịch sử đăng nhập của chính mình, mới nhất trước */
    loginHistory: async (query: ListLoginHistoryQuery = {}) =>
      toPaginated(await http.get<LoginHistoryDto[]>('/me/login-history', { query })),

    notifications: {
      list: async (query: ListNotificationsQuery = {}) =>
        toPaginated(await http.get<NotificationDto[]>('/me/notifications', { query })),
      unreadCount: async () =>
        (await http.get<UnreadCountDto>('/me/notifications/unread-count')).data.count,
      markRead: async (ids: string[]) => {
        await http.post('/me/notifications/read', { ids });
      },
      markAllRead: async () => {
        await http.post('/me/notifications/read-all');
      },
    },
  };
}

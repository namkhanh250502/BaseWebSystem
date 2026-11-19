import type {
  AppName,
  AuthSession,
  ForgotPasswordInput,
  LoginInput,
  LoginResult,
  MeDto,
  RegisterInput,
  ResetPasswordInput,
  PasskeyLoginInput,
  TwoFactorChallengeInfoDto,
  TwoFactorLoginInput,
  TwoFactorMethod,
  TwoFactorSetupConfirmInput,
  TwoFactorSetupStartDto,
  TwoFactorSetupStartInput,
  WebAuthnOptionsJSON,
} from '@base/shared';
import type { HttpClient } from '../http';

export function createAuthApi(http: HttpClient, baseUrl: string, app: AppName) {
  /** Lưu access token mới vào client sau mỗi lần đăng nhập thành công */
  const remember = <T extends object>(result: T) => {
    if ('accessToken' in result && typeof result.accessToken === 'string') {
      http.setAccessToken(result.accessToken);
    }
    return result;
  };

  return {
    login: async (input: LoginInput) =>
      remember((await http.post<LoginResult>('/auth/login', input)).data),
    register: async (input: RegisterInput) =>
      remember((await http.post<LoginResult>('/auth/register', input)).data),
    // ----- Bước 2FA khi đăng nhập -----
    /** Phương thức 2FA của user (sau khi quay về từ đăng nhập Google) */
    twoFactorMethods: async (tempToken: string) =>
      (await http.post<TwoFactorChallengeInfoDto>('/auth/2fa/methods', { tempToken })).data,
    /** Gửi mã 2FA qua email */
    sendTwoFactorEmail: async (tempToken: string) =>
      (
        await http.post<{ emailHint: string; cooldownSeconds: number }>('/auth/2fa/email/send', {
          tempToken,
        })
      ).data,
    /** Nhập mã TOTP / email / mã dự phòng */
    verifyTwoFactor: async (input: TwoFactorLoginInput) =>
      remember((await http.post<LoginResult>('/auth/2fa/verify', input)).data),
    passkeyLoginOptions: async (tempToken: string) =>
      (await http.post<WebAuthnOptionsJSON>('/auth/2fa/passkey/options', { tempToken })).data,
    verifyPasskeyLogin: async (input: PasskeyLoginInput) =>
      remember((await http.post<LoginResult>('/auth/2fa/passkey/verify', input)).data),
    /** Phương thức được chọn khi bắt buộc thiết lập 2FA (sau khi quay về từ đăng nhập Google) */
    twoFactorSetupMethods: async (tempToken: string) =>
      (
        await http.post<{ allowedMethods: TwoFactorMethod[] }>('/auth/2fa/setup/methods', {
          tempToken,
        })
      ).data,
    /** Thiết lập 2FA bắt buộc (tài khoản admin): bắt đầu với 1 phương thức */
    setupTwoFactor: async (input: TwoFactorSetupStartInput) =>
      (await http.post<TwoFactorSetupStartDto>('/auth/2fa/setup', input)).data,
    confirmTwoFactorSetup: async (input: TwoFactorSetupConfirmInput) =>
      remember((await http.post<LoginResult>('/auth/2fa/setup/confirm', input)).data),
    /** Khôi phục phiên từ cookie (gọi khi mở app) */
    refresh: async () => remember((await http.post<AuthSession>('/auth/refresh')).data),
    logout: async () => {
      try {
        await http.post('/auth/logout');
      } finally {
        http.setAccessToken(null);
      }
    },
    /** URL bắt đầu đăng nhập Google (điều hướng cả trang tới đây) */
    googleUrl: (options: { returnTo?: string; lang?: string } = {}) => {
      const params = new URLSearchParams({ app });
      if (options.returnTo) params.set('returnTo', options.returnTo);
      if (options.lang) params.set('lang', options.lang);
      return `${baseUrl.replace(/\/$/, '')}/auth/google?${params}`;
    },
    me: async () => (await http.get<MeDto>('/auth/me')).data,
    forgotPassword: async (input: ForgotPasswordInput) =>
      (await http.post<{ message: string }>('/auth/forgot-password', input)).data,
    resetPassword: async (input: ResetPasswordInput) =>
      (await http.post<{ message: string }>('/auth/reset-password', input)).data,
  };
}

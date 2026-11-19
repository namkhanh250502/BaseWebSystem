import { z } from 'zod';

/* ---------------------------------------------------------
 * Xác thực 2 lớp đa phương thức: TOTP (ứng dụng Authenticator), Email, Passkey (WebAuthn)
 * ---------------------------------------------------------*/

export const TWO_FACTOR_METHODS = ['totp', 'email', 'passkey'] as const;
export type TwoFactorMethod = (typeof TWO_FACTOR_METHODS)[number];

/** Phương thức "mạnh": không phụ thuộc hộp thư (vốn cũng dùng để đặt lại mật khẩu) */
export const STRONG_TWO_FACTOR_METHODS: readonly TwoFactorMethod[] = ['passkey', 'totp'];

/** Thứ tự ưu tiên khi chọn phương thức mặc định */
export const TWO_FACTOR_METHOD_PRIORITY: readonly TwoFactorMethod[] = ['passkey', 'totp', 'email'];

/** Cách xác minh: 1 trong các phương thức hoặc mã dự phòng */
export const TWO_FACTOR_VERIFY_METHODS = [...TWO_FACTOR_METHODS, 'backup'] as const;
export type TwoFactorVerifyMethod = (typeof TWO_FACTOR_VERIFY_METHODS)[number];

/** Header mang token xác minh lại (step-up) cho thao tác nhạy cảm */
export const REAUTH_HEADER = 'x-reauth-token';
export const REAUTH_TOKEN_TTL_SECONDS = 5 * 60;

export const TWO_FACTOR_EMAIL_CODE_TTL_MINUTES = 10;
export const TWO_FACTOR_EMAIL_RESEND_SECONDS = 60;
/** Nhập sai quá số lần này thì mã email bị huỷ, phải gửi mã mới */
export const TWO_FACTOR_EMAIL_MAX_ATTEMPTS = 5;
export const MAX_PASSKEYS_PER_USER = 10;

export const twoFactorMethodSchema = z.enum(TWO_FACTOR_METHODS);
export const twoFactorVerifyMethodSchema = z.enum(TWO_FACTOR_VERIFY_METHODS);

/** Mã 6 số (TOTP / email) */
export const sixDigitCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

/**
 * Phản hồi của trình duyệt từ `navigator.credentials.create/get` dạng JSON
 * (RegistrationResponseJSON / AuthenticationResponseJSON). Kiểm tra chi tiết do server WebAuthn làm.
 */
export const webAuthnResponseSchema = z.looseObject({
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal('public-key'),
  response: z.record(z.string(), z.unknown()),
  clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
  authenticatorAttachment: z.string().optional(),
});
export type WebAuthnResponseInput = z.infer<typeof webAuthnResponseSchema>;

/** Options truyền thẳng cho `@simplewebauthn/browser` (startRegistration / startAuthentication) */
export type WebAuthnOptionsJSON = Record<string, unknown>;

export const passkeyNameSchema = z.string().trim().min(1).max(100);

// ----- Đăng nhập (dùng tempToken) -----

export const passkeyLoginSchema = z.object({
  tempToken: z.string().min(1),
  response: webAuthnResponseSchema,
});

export const twoFactorSetupStartSchema = z.object({
  tempToken: z.string().min(1),
  method: twoFactorMethodSchema.default('totp'),
});

export const twoFactorSetupConfirmSchema = z.object({
  tempToken: z.string().min(1),
  method: twoFactorMethodSchema,
  code: sixDigitCodeSchema.optional(),
  response: webAuthnResponseSchema.optional(),
  name: passkeyNameSchema.optional(),
});

export type PasskeyLoginInput = z.input<typeof passkeyLoginSchema>;
export type TwoFactorSetupStartInput = z.input<typeof twoFactorSetupStartSchema>;
export type TwoFactorSetupConfirmInput = z.input<typeof twoFactorSetupConfirmSchema>;

/** Thông tin để hiển thị bước nhập 2FA khi đăng nhập */
export interface TwoFactorChallengeInfoDto {
  methods: TwoFactorMethod[];
  defaultMethod: TwoFactorMethod | null;
  /** Email đã che bớt, ví dụ "ng***@gmail.com" (chỉ có khi bật email 2FA) */
  emailHint?: string;
}

/** Kết quả bắt đầu thiết lập 1 phương thức */
export type TwoFactorSetupStartDto =
  | { method: 'totp'; qrCode: string; secret: string; otpauthUrl: string }
  | { method: 'email'; emailHint: string; cooldownSeconds: number }
  | { method: 'passkey'; options: WebAuthnOptionsJSON };

// ----- Quản lý ở trang tài khoản (/me/2fa) -----

export const reauthPrepareSchema = z.object({
  method: twoFactorMethodSchema,
});

export const reauthSchema = z.object({
  method: twoFactorVerifyMethodSchema,
  code: z.string().trim().min(6).max(20).optional(),
  response: webAuthnResponseSchema.optional(),
});

export const addPasskeySchema = z.object({
  name: passkeyNameSchema,
  response: webAuthnResponseSchema,
});

export const renamePasskeySchema = z.object({
  name: passkeyNameSchema,
});

export const defaultTwoFactorMethodSchema = z.object({
  method: twoFactorMethodSchema,
});

export type ReauthPrepareInput = z.infer<typeof reauthPrepareSchema>;
export type ReauthInput = z.input<typeof reauthSchema>;
export type AddPasskeyInput = z.input<typeof addPasskeySchema>;

/** Kết quả bước chuẩn bị xác minh: email → đã gửi mã; passkey → options cho trình duyệt; totp → rỗng */
export interface TwoFactorPrepareDto {
  emailHint?: string;
  cooldownSeconds?: number;
  options?: WebAuthnOptionsJSON;
}

export interface ReauthTokenDto {
  reauthToken: string;
  /** Giây */
  expiresIn: number;
}

export interface PasskeyDto {
  id: string;
  name: string;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface TwoFactorStatusDto {
  enabled: boolean;
  defaultMethod: TwoFactorMethod | null;
  /** Phương thức hệ thống cho phép bật (setting two_factor_methods) */
  availableMethods: TwoFactorMethod[];
  totp: { enabled: boolean };
  email: { enabled: boolean; canEnable: boolean; emailHint: string };
  passkeys: PasskeyDto[];
  backupCodesRemaining: number;
  /** Tài khoản quản trị bắt buộc 2FA: phải giữ lại ít nhất 1 phương thức trong danh sách này */
  requiredMethods: TwoFactorMethod[] | null;
}

/** Bật phương thức: chỉ có backupCodes khi đây là phương thức đầu tiên (2FA vừa chuyển sang bật) */
export interface TwoFactorEnabledDto {
  backupCodes?: string[];
}

export interface PasskeyAddedDto extends TwoFactorEnabledDto {
  passkey: PasskeyDto;
}

/** Che bớt email: "nguyenvana@gmail.com" → "ng********@gmail.com" */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

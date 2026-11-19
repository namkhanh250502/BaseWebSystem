import { z } from 'zod';
import { nameSchema, otpCodeSchema, passwordSchema } from './common';
import type { TwoFactorChallengeInfoDto, TwoFactorMethod } from './two-factor';
import type { MeDto } from './user';

/** Frontend gửi header này để server biết cookie refresh và link email thuộc app nào */
export const APP_HEADER = 'x-app';
export const APPS = ['admin', 'user'] as const;
export type AppName = (typeof APPS)[number];

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export const registerSchema = z.object({
  email: z.email().max(255),
  firstName: nameSchema,
  lastName: nameSchema,
  password: passwordSchema,
  captchaToken: z.string().max(4096).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(256),
  password: passwordSchema,
});

export const twoFactorTokenSchema = z.object({
  tempToken: z.string().min(1),
});

export const twoFactorLoginSchema = z.object({
  tempToken: z.string().min(1),
  /** Bỏ trống: mã 6 số -> TOTP (hoặc email nếu chỉ bật email), còn lại -> mã dự phòng */
  method: z.enum(['totp', 'email', 'backup']).optional(),
  code: otpCodeSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type TwoFactorLoginInput = z.infer<typeof twoFactorLoginSchema>;

export interface AuthSession {
  accessToken: string;
  user: MeDto;
  /** Chỉ có khi vừa bật 2FA trong lúc đăng nhập: hiển thị 1 lần cho người dùng lưu lại */
  backupCodes?: string[];
}

/**
 * Kết quả đăng nhập:
 * - `session`: đăng nhập thành công
 * - `requires2fa`: cần xác minh 2FA bằng 1 trong `methods` (hoặc mã dự phòng)
 * - `requiresSetup`: tài khoản admin bắt buộc thiết lập 2FA trước khi vào
 */
export type LoginResult =
  | ({ status: 'success' } & AuthSession)
  | ({ status: 'requires2fa'; tempToken: string } & TwoFactorChallengeInfoDto)
  | { status: 'requiresSetup'; tempToken: string; allowedMethods: TwoFactorMethod[] };

export interface TwoFactorSetupDto {
  qrCode: string;
  secret: string;
  otpauthUrl: string;
}

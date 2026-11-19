import { z } from 'zod';
import { LOCALES } from '../constants/locales';
import { nameSchema, passwordSchema } from './common';

/** Cập nhật thông tin cá nhân của user đang đăng nhập */
export const updateProfileSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    lang: z.enum(LOCALES),
  })
  .partial();

/** currentPassword bắt buộc nếu tài khoản đã có mật khẩu (tài khoản Google lần đầu đặt thì bỏ trống) */
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export interface EmailVerificationSentDto {
  /** Số giây phải chờ trước khi gửi lại */
  cooldownSeconds: number;
}

export const EMAIL_VERIFICATION_CODE_TTL_MINUTES = 10;
export const EMAIL_VERIFICATION_RESEND_SECONDS = 60;

/** Xác nhận bật TOTP / email 2FA bằng mã 6 số */
export const enableTwoFactorSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

/** Tắt toàn bộ 2FA: cần header x-reauth-token + mật khẩu */
export const disableTwoFactorSchema = z.object({
  /** Bỏ trống với tài khoản chưa có mật khẩu (tạo qua Google) */
  password: z.string().max(128).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DisableTwoFactorInput = z.infer<typeof disableTwoFactorSchema>;

export interface BackupCodesDto {
  backupCodes: string[];
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.uuid(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/** Chính sách mật khẩu: tối thiểu 8 ký tự, có ít nhất 1 chữ số */
export const PASSWORD_MIN_LENGTH = 8;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(128)
  .regex(/\d/, { message: 'password.needDigit' });

export const nameSchema = z.string().trim().min(1).max(100);

/** Mã OTP 6 số từ ứng dụng Authenticator, hoặc mã dự phòng dạng XXXX-XXXX */
export const otpCodeSchema = z
  .string()
  .trim()
  .min(6)
  .max(20);

export type IdParam = z.infer<typeof idParamSchema>;

/** Query phân trang phía client gửi lên */
export interface PageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

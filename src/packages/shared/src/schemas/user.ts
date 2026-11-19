import { z } from 'zod';
import { LOCALES, type Locale } from '../constants/locales';
import type { PermissionKey } from '../constants/permissions';
import {
  nameSchema,
  paginationQuerySchema,
  passwordSchema,
  sortOrderSchema,
  type PageQuery,
} from './common';

export const USER_SORT_FIELDS = ['email', 'firstName', 'createdAt', 'lastLoginAt'] as const;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(255).optional(),
  status: z.enum(['active', 'locked']).optional(),
  emailVerification: z.enum(['verified', 'unverified']).optional(),
  roleId: z.uuid().optional(),
  sortBy: z.enum(USER_SORT_FIELDS).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export const createUserSchema = z.object({
  email: z.email().max(255),
  firstName: nameSchema,
  lastName: nameSchema,
  password: passwordSchema,
  roleId: z.uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  isSuperAdmin: z.boolean().default(false),
});

export const updateUserSchema = z
  .object({
    email: z.email().max(255),
    firstName: nameSchema,
    lastName: nameSchema,
    roleId: z.uuid().nullable(),
    isActive: z.boolean(),
    isSuperAdmin: z.boolean(),
    emailVerified: z.boolean(),
    lang: z.enum(LOCALES),
  })
  .partial();

export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export interface ListUsersQuery extends PageQuery {
  status?: 'active' | 'locked';
  emailVerification?: 'verified' | 'unverified';
  roleId?: string;
}

export interface RoleRef {
  id: string;
  name: string;
}

/** Dữ liệu user trả về cho client (không bao giờ chứa mật khẩu / secret) */
export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  lang: Locale;
  isActive: boolean;
  isSuperAdmin: boolean;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  /** false với tài khoản tạo qua Google chưa từng đặt mật khẩu */
  hasPassword: boolean;
  /** Đã liên kết tài khoản Google */
  googleLinked: boolean;
  role: RoleRef | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** User đang đăng nhập, kèm danh sách quyền */
export interface MeDto extends UserDto {
  permissions: PermissionKey[];
  /** Hệ thống bắt buộc xác minh email và user chưa xác minh → chỉ được dùng trang xác minh */
  emailVerificationRequired: boolean;
}

export interface ResetUserPasswordResult {
  password: string;
}

/** Họ tên đầy đủ: tiếng Việt "Họ Tên", tiếng Anh "First Last" */
export function fullName(
  user: Pick<UserDto, 'firstName' | 'lastName'>,
  locale: Locale = 'en',
): string {
  const parts = locale === 'vi' ? [user.lastName, user.firstName] : [user.firstName, user.lastName];
  return parts.filter(Boolean).join(' ');
}

/** Độ mịn của biểu đồ tăng trưởng người dùng ở tab "Phân tích" */
export const USER_ANALYTICS_UNITS = ['day', 'month'] as const;
export type UserAnalyticsUnit = (typeof USER_ANALYTICS_UNITS)[number];

/** Múi giờ mặc định khi client không gửi (hoặc gửi múi giờ không hợp lệ) */
export const DEFAULT_ANALYTICS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Chia theo ngày tối đa 1 năm, theo tháng tối đa 20 năm — chặn request dựng mảng mốc quá lớn */
const MAX_SPAN_DAYS: Record<UserAnalyticsUnit, number> = { day: 366, month: 366 * 20 };

const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/**
 * Query thống kê người dùng. Biên khoảng là mốc tuyệt đối (ISO) kèm `timeZone` của người xem,
 * để backend gom đúng ngày/tháng mà người xem nhìn thấy dù DB lưu UTC.
 */
export const userAnalyticsQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    timeZone: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((tz) => (tz && isValidTimeZone(tz) ? tz : DEFAULT_ANALYTICS_TIME_ZONE)),
    unit: z.enum(USER_ANALYTICS_UNITS).default('day'),
  })
  .refine((v) => Date.parse(v.from) <= Date.parse(v.to), {
    message: 'users.analyticsInvalidRange',
    path: ['to'],
  })
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= MAX_SPAN_DAYS[v.unit] * DAY_MS, {
    message: 'users.analyticsRangeTooLong',
    path: ['to'],
  });

export type UserAnalyticsQuery = z.input<typeof userAnalyticsQuerySchema>;

export interface UserAnalyticsPoint {
  /** `YYYY-MM-DD` (unit = day) hoặc `YYYY-MM` (unit = month), theo `timeZone` */
  bucket: string;
  newUsers: number;
  newVerifiedUsers: number;
}

export interface UserAnalyticsDto {
  unit: UserAnalyticsUnit;
  from: string;
  to: string;
  timeZone: string;
  /** Lũy kế tới `to` */
  totalUsers: number;
  /** Lũy kế tới `to`: đã xác minh email */
  verifiedUsers: number;
  points: UserAnalyticsPoint[];
}

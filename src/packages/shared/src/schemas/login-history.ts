import { paginationQuerySchema } from './common';

export const listLoginHistoryQuerySchema = paginationQuerySchema;

/** Số lần đăng nhập gần nhất được lưu cho mỗi người dùng (cũ hơn sẽ bị xoá) */
export const LOGIN_HISTORY_LIMIT = 10;

export interface ListLoginHistoryQuery {
  page?: number;
  pageSize?: number;
}

export const DEVICE_TYPES = ['desktop', 'mobile', 'tablet', 'bot', 'unknown'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

/** Thiết bị phân tích từ User-Agent */
export interface DeviceInfo {
  type: DeviceType;
  /** Ví dụ 'Chrome', 'Safari', 'Edge' (null = không nhận ra) */
  browser: string | null;
  browserVersion: string | null;
  /** Ví dụ 'Windows', 'macOS', 'iOS', 'Android' */
  os: string | null;
  osVersion: string | null;
  /** Tên máy nếu User-Agent có (ví dụ 'iPhone', 'iPad', 'SM-S918B') */
  model: string | null;
}

export interface LoginLocation {
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

export interface LoginHistoryDto {
  id: string;
  app: 'admin' | 'user';
  ipAddress: string | null;
  /** true khi IP là mạng nội bộ / localhost (không tra được vị trí) */
  isPrivateIp: boolean;
  /** null = chưa xác định được vị trí */
  location: LoginLocation | null;
  device: DeviceInfo;
  userAgent: string | null;
  /** Cách đã qua 2FA: 'totp' | 'email' | 'passkey' | 'backup' (null = không qua 2FA) */
  twoFactorMethod: string | null;
  createdAt: string;
}

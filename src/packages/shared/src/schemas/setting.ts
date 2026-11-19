import { z } from 'zod';
import type { SettingValueType } from '../constants/settings';

const settingNameSchema = z.string().trim().min(1).max(255);
const settingValueSchema = z.string().max(65535).nullable();

/**
 * Lưu nhiều cài đặt cùng lúc: { values: { site_name: "ABC", smtp_port: "587" } }.
 * Chỉ nhận key hệ thống. Key bí mật không gửi lên thì giữ nguyên giá trị cũ.
 */
export const updateSettingsSchema = z.object({
  values: z.record(settingNameSchema, settingValueSchema),
});

export const exportSettingsQuerySchema = z.object({
  includeSecrets: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

/**
 * File import chấp nhận 3 dạng (frontend chuẩn hoá về mảng trước khi gửi):
 * - file export của hệ thống: { version, exportedAt, settings: [{ name, value }] }
 * - mảng [{ name, value }]
 * - object { "site_name": "ABC", ... }
 * Key không phải key hệ thống sẽ bị bỏ qua.
 */
export const importSettingsSchema = z.object({
  settings: z
    .array(z.object({ name: settingNameSchema, value: settingValueSchema }))
    .min(1)
    .max(1000),
  /** false: chỉ đặt key chưa có giá trị; true: ghi đè cả key đã có */
  overwrite: z.boolean().default(true),
});

export type ImportSettingsInput = z.input<typeof importSettingsSchema>;

export interface SettingOptionDto {
  value: string;
  label: string;
}

/**
 * 1 key hệ thống kèm giá trị hiện tại — đủ thông tin để frontend tự sinh ô nhập
 * (nhãn, mô tả đã dịch theo ngôn ngữ của request).
 */
export interface SettingItemDto {
  name: string;
  group: string;
  type: SettingValueType;
  label: string;
  description: string;
  placeholder: string | null;
  defaultValue: string;
  isSecret: boolean;
  isPublic: boolean;
  /** Chỉ có với select / multiselect */
  options: SettingOptionDto[] | null;
  /** null nếu là key bí mật (không bao giờ trả giá trị thật về client) */
  value: string | null;
  /** Đã có giá trị khác rỗng */
  configured: boolean;
  updatedAt: string | null;
}

/** Gợi ý hiển thị đầu nhóm: 1 dòng chữ + các dòng code (vd. URL cần khai báo) */
export interface SettingHintDto {
  text: string;
  code: string[];
}

/** 1 nhóm cài đặt (thứ tự nhóm và thứ tự key do backend quyết định) */
export interface SettingGroupDto {
  name: string;
  title: string;
  description: string;
  hint: SettingHintDto | null;
  items: SettingItemDto[];
}

export interface SettingsExportFile {
  version: 1;
  exportedAt: string;
  includeSecrets: boolean;
  settings: { name: string; value: string | null }[];
}

export interface ImportSettingsResult {
  created: number;
  updated: number;
  skipped: number;
  /** Key trong file không phải key hệ thống */
  unknown: string[];
}

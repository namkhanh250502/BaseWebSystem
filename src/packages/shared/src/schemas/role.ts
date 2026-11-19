import { z } from 'zod';
import {
  HTTP_METHODS,
  PERMISSION_KEYS,
  PERMISSION_TYPES,
  type HttpMethod,
  type PermissionDefinition,
  type PermissionKey,
  type PermissionType,
} from '../constants/permissions';
import { paginationQuerySchema, sortOrderSchema, type PageQuery } from './common';

export const ROLE_SORT_FIELDS = ['name', 'createdAt'] as const;

export const listRolesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(255).optional(),
  sortBy: z.enum(ROLE_SORT_FIELDS).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  isActive: z.boolean().default(true),
  /**
   * Cờ "được vào trang admin" — thực chất bật/tắt quyền `admin.access` của role.
   * Bỏ trống = giữ nguyên (khi sửa) / theo role nguồn hoặc không có (khi tạo).
   */
  adminAccess: z.boolean().optional(),
  /** Tạo role mới bằng cách sao chép toàn bộ quyền từ role này */
  cloneFromRoleId: z.uuid().optional(),
});

export const updateRoleSchema = createRoleSchema.omit({ cloneFromRoleId: true }).partial();

export const assignPermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]])).max(500),
});

export const syncPermissionsSchema = z.object({
  removeStale: z.boolean().default(false),
});

export type CreateRoleInput = z.input<typeof createRoleSchema>;
export type UpdateRoleInput = z.input<typeof updateRoleSchema>;
export type ListRolesQuery = PageQuery;

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  /** Role có quyền `admin.access` (được vào trang quản trị) */
  adminAccess: boolean;
  permissions: PermissionKey[];
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionDto {
  id: string;
  key: string;
  module: string;
  type: PermissionType;
  method: HttpMethod | null;
  apiPath: string | null;
  /** Ghi chú do admin tự đặt */
  description: string | null;
  /** false nếu permission có trong DB nhưng không còn trong code */
  defined: boolean;
  /** true nếu module / method / URL / loại đang khác với định nghĩa trong code */
  modified: boolean;
  roleCount: number;
  createdAt: string;
  updatedAt: string;
}

export const updatePermissionSchema = z
  .object({
    module: z.string().trim().min(1).max(50),
    type: z.enum(PERMISSION_TYPES),
    method: z.enum(HTTP_METHODS).nullable(),
    apiPath: z
      .string()
      .trim()
      .max(255)
      .regex(/^\//, { message: 'permission.apiPathFormat' })
      .nullable(),
    description: z.string().trim().max(1000).nullable(),
  })
  .partial();

export type UpdatePermissionInput = z.infer<typeof updatePermissionSchema>;

export type PermissionField = 'module' | 'type' | 'method' | 'apiPath';

export interface PermissionSyncPreview {
  defined: number;
  unchanged: number;
  toAdd: PermissionDefinition[];
  /** Permission có trong DB nhưng module / method / URL / loại khác với code */
  changes: { key: string; field: PermissionField; from: string | null; to: string | null }[];
  toRemove: { key: string; module: string; roles: string[] }[];
}

export interface PermissionSyncResult {
  added: number;
  updated: number;
  removed: number;
}

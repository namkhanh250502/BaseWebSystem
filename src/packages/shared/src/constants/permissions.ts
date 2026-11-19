/**
 * Danh sách permission của hệ thống, định nghĩa trong code.
 * Giống hệ thống gốc: mỗi permission ứng với 1 API (method + URL); riêng loại CLIENT
 * là quyền truy cập giao diện, không gắn API.
 *
 * - `key` là định danh cố định dùng để kiểm tra quyền (không đổi được).
 * - module / method / apiPath được đồng bộ vào DB và có thể sửa ở trang admin;
 *   màn hình "Đồng bộ" sẽ chỉ ra chỗ nào đang khác với code.
 * Tên hiển thị được dịch ở frontend theo key `permissions:items.<key>`.
 */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const PERMISSION_TYPES = ['SERVER', 'CLIENT'] as const;
export type PermissionType = (typeof PERMISSION_TYPES)[number];

export interface PermissionDefinition {
  key: string;
  module: string;
  type: PermissionType;
  method: HttpMethod | null;
  apiPath: string | null;
}

const api = (method: HttpMethod, path: string) =>
  ({ type: 'SERVER', method, apiPath: `/api/v1${path}` }) as const;

export const PERMISSION_DEFINITIONS = [
  { key: 'admin.access', module: 'admin', type: 'CLIENT', method: null, apiPath: null },

  { key: 'dashboard.userGrowth', module: 'dashboard', ...api('GET', '/dashboard/user-growth') },

  { key: 'users.list', module: 'users', ...api('GET', '/users') },
  { key: 'users.view', module: 'users', ...api('GET', '/users/:id') },
  { key: 'users.create', module: 'users', ...api('POST', '/users') },
  { key: 'users.update', module: 'users', ...api('PATCH', '/users/:id') },
  { key: 'users.resetPassword', module: 'users', ...api('POST', '/users/:id/reset-password') },
  { key: 'users.disableTwoFactor', module: 'users', ...api('POST', '/users/:id/disable-2fa') },
  { key: 'users.loginHistory', module: 'users', ...api('GET', '/users/:id/login-history') },
  { key: 'users.analytics', module: 'users', ...api('GET', '/users/analytics') },

  { key: 'roles.list', module: 'roles', ...api('GET', '/roles') },
  { key: 'roles.view', module: 'roles', ...api('GET', '/roles/:id') },
  { key: 'roles.create', module: 'roles', ...api('POST', '/roles') },
  { key: 'roles.update', module: 'roles', ...api('PATCH', '/roles/:id') },
  { key: 'roles.delete', module: 'roles', ...api('DELETE', '/roles/:id') },
  { key: 'roles.assignPermissions', module: 'roles', ...api('PUT', '/roles/:id/permissions') },

  { key: 'permissions.list', module: 'permissions', ...api('GET', '/permissions') },
  { key: 'permissions.update', module: 'permissions', ...api('PATCH', '/permissions/:id') },
  { key: 'permissions.syncPreview', module: 'permissions', ...api('GET', '/permissions/sync') },
  { key: 'permissions.sync', module: 'permissions', ...api('POST', '/permissions/sync') },

  { key: 'settings.list', module: 'settings', ...api('GET', '/settings') },
  { key: 'settings.update', module: 'settings', ...api('PUT', '/settings') },
  { key: 'settings.export', module: 'settings', ...api('GET', '/settings/export') },
  { key: 'settings.import', module: 'settings', ...api('POST', '/settings/import') },

  { key: 'notifications.send', module: 'notifications', ...api('POST', '/notifications') },
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSION_DEFINITIONS)[number]['key'];
export type PermissionModule = (typeof PERMISSION_DEFINITIONS)[number]['module'];

export const PERMISSION_KEYS: PermissionKey[] = PERMISSION_DEFINITIONS.map((p) => p.key);

/** Permission nhóm theo module, giữ đúng thứ tự khai báo */
export const PERMISSION_MODULES = PERMISSION_DEFINITIONS.reduce(
  (acc, p) => {
    (acc[p.module] ??= []).push(p.key);
    return acc;
  },
  {} as Record<PermissionModule, PermissionKey[]>,
);

export function getPermissionDefinition(key: string): PermissionDefinition | undefined {
  return (PERMISSION_DEFINITIONS as readonly PermissionDefinition[]).find((p) => p.key === key);
}

/** Tên role mặc định được tạo bởi seed */
export const SYSTEM_ROLES = {
  ADMINISTRATOR: 'Administrator',
  USER: 'User',
} as const;

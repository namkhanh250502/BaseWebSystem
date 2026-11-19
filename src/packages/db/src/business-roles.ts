import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } from '@base/shared';
import { inArray } from 'drizzle-orm';
import type { Database } from './client';
import { permissions, rolePermissions, roles } from './schema';

const BUSINESS_ROLES = [
  {
    name: SYSTEM_ROLES.MANAGER,
    description: 'Quản lý cửa hàng: hàng hoá, nhập hàng, kho, báo cáo',
  },
  { name: SYSTEM_ROLES.STAFF, description: 'Nhân viên bán hàng tại quầy' },
] as const;

export interface EnsureBusinessRolesResult {
  created: string[];
  /** Vai trò đã tồn tại (kể cả do admin tạo / chỉnh) — giữ nguyên, không đổi quyền */
  existing: string[];
}

/**
 * Tạo vai trò Manager / Staff nếu chưa có và gán bộ quyền mặc định CHỈ khi vừa tạo, để quyền
 * admin đã chỉnh không bị ghi đè khi seed lại (research R9). Gọi sau khi đã đồng bộ permission.
 */
export async function ensureBusinessRoles(db: Database): Promise<EnsureBusinessRolesResult> {
  const result: EnsureBusinessRolesResult = { created: [], existing: [] };
  for (const definition of BUSINESS_ROLES) {
    const [role] = await db
      .insert(roles)
      .values({ ...definition, isSystem: true })
      .onConflictDoNothing({ target: roles.name })
      .returning({ id: roles.id });
    if (!role) {
      result.existing.push(definition.name);
      continue;
    }
    const keys = DEFAULT_ROLE_PERMISSIONS[definition.name];
    const rows = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.key, [...keys]));
    if (rows.length) {
      await db
        .insert(rolePermissions)
        .values(rows.map((p) => ({ roleId: role.id, permissionId: p.id })))
        .onConflictDoNothing();
    }
    result.created.push(definition.name);
  }
  return result;
}

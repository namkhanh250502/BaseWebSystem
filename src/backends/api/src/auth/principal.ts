import { Injectable } from '@nestjs/common';
import { and, eq, permissions, rolePermissions, roles, users, type User } from '@base/db';
import { PERMISSION_KEYS, type PermissionKey } from '@base/shared';
import { verifyJwt } from '@base/server-kit';
import { getEnv } from '../config/env';
import { InjectDb, type Database } from '../core/database';
import { SettingsService } from '../settings/settings.service';

export const ACCESS_TOKEN_AUDIENCE = 'access';

/** User đang đăng nhập kèm role và quyền hiệu lực */
export interface Principal {
  user: User;
  role: { id: string; name: string } | null;
  /** Danh sách quyền hiệu lực (super admin = mọi quyền; role bị vô hiệu = không quyền nào) */
  permissions: PermissionKey[];
  can: (permission: PermissionKey) => boolean;
  /** Hệ thống bắt buộc xác minh email (setting) và user chưa xác minh */
  emailVerificationRequired: boolean;
}

/** Được vào trang quản trị: super admin hoặc có quyền admin.access */
export function canAccessAdmin(principal: Principal): boolean {
  return principal.can('admin.access');
}

@Injectable()
export class PrincipalService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly settings: SettingsService,
  ) {}

  async verifyAccessToken(token: string): Promise<string | null> {
    const result = await verifyJwt(token, getEnv().JWT_SECRET, ACCESS_TOKEN_AUDIENCE);
    return result?.subject ?? null;
  }

  /** Nạp user kèm role và quyền từ DB */
  async load(userId: string): Promise<Principal | null> {
    const [row] = await this.db
      .select({ user: users, role: { id: roles.id, name: roles.name, isActive: roles.isActive } })
      .from(users)
      .leftJoin(roles, eq(roles.id, users.roleId))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) return null;

    let keys: PermissionKey[] = [];
    if (row.user.isSuperAdmin) {
      keys = [...PERMISSION_KEYS];
    } else if (row.role?.isActive) {
      const rows = await this.db
        .select({ key: permissions.key })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(and(eq(rolePermissions.roleId, row.role.id)));
      const defined = new Set<string>(PERMISSION_KEYS);
      keys = rows.map((r) => r.key).filter((k): k is PermissionKey => defined.has(k));
    }

    const set = new Set(keys);
    return {
      user: row.user,
      role: row.role ? { id: row.role.id, name: row.role.name } : null,
      permissions: keys,
      can: (permission) => row.user.isSuperAdmin || set.has(permission),
      emailVerificationRequired:
        !row.user.emailVerifiedAt &&
        !row.user.isSuperAdmin &&
        (await this.settings.getBoolean('require_email_verification')),
    };
  }
}

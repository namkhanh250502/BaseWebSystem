import { Injectable } from '@nestjs/common';
import {
  applyPermissionSync,
  asc,
  count,
  eq,
  permissions,
  previewPermissionSync,
  rolePermissions,
  type Permission,
} from '@base/db';
import {
  getPermissionDefinition,
  type HttpMethod,
  type PermissionDto,
  type PermissionType,
  type UpdatePermissionInput,
} from '@base/shared';
import { notFound } from '@base/server-kit';
import { InjectDb, type Database } from '../core/database';

function toDto(p: Permission, roleCount: number): PermissionDto {
  const def = getPermissionDefinition(p.key);
  return {
    id: p.id,
    key: p.key,
    module: p.module,
    type: p.type as PermissionType,
    method: p.method as HttpMethod | null,
    apiPath: p.apiPath,
    description: p.description,
    defined: Boolean(def),
    modified: Boolean(
      def &&
        (def.module !== p.module ||
          def.type !== p.type ||
          (def.method ?? null) !== p.method ||
          (def.apiPath ?? null) !== p.apiPath),
    ),
    roleCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

@Injectable()
export class PermissionsService {
  constructor(@InjectDb() private readonly db: Database) {}

  async list() {
    const rows = await this.db
      .select({ permission: permissions, roleCount: count(rolePermissions.roleId) })
      .from(permissions)
      .leftJoin(rolePermissions, eq(rolePermissions.permissionId, permissions.id))
      .groupBy(permissions.id)
      .orderBy(asc(permissions.module), asc(permissions.key));
    return rows.map((r) => toDto(r.permission, r.roleCount));
  }

  /** Sửa module / loại / method / URL / mô tả; key giữ nguyên */
  async update(id: string, input: UpdatePermissionInput) {
    const [row] = await this.db.update(permissions).set(input).where(eq(permissions.id, id)).returning();
    if (!row) throw notFound('permissions.notFound');
    const [usage] = await this.db
      .select({ value: count() })
      .from(rolePermissions)
      .where(eq(rolePermissions.permissionId, id));
    return toDto(row, usage?.value ?? 0);
  }

  previewSync() {
    return previewPermissionSync(this.db);
  }

  sync(removeStale: boolean) {
    return applyPermissionSync(this.db, { removeStale });
  }
}

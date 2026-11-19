import {
  PERMISSION_DEFINITIONS,
  type PermissionDefinition,
  type PermissionField,
  type PermissionSyncPreview,
  type PermissionSyncResult,
} from '@base/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Database } from './client';
import { permissions, rolePermissions, roles } from './schema';

const FIELDS: PermissionField[] = ['module', 'type', 'method', 'apiPath'];
const DEFINITIONS = PERMISSION_DEFINITIONS as readonly PermissionDefinition[];

/** So sánh danh sách permission trong code với DB */
export async function previewPermissionSync(db: Database): Promise<PermissionSyncPreview> {
  const existing = await db.select().from(permissions);
  const existingByKey = new Map(existing.map((p) => [p.key, p]));
  const definedKeys = new Set(DEFINITIONS.map((p) => p.key));

  const toAdd = DEFINITIONS.filter((p) => !existingByKey.has(p.key));
  const changes = DEFINITIONS.flatMap((def) => {
    const row = existingByKey.get(def.key);
    if (!row) return [];
    return FIELDS.filter((f) => (row[f] ?? null) !== (def[f] ?? null)).map((field) => ({
      key: def.key,
      field,
      from: row[field] ?? null,
      to: def[field] ?? null,
    }));
  });

  const stale = existing.filter((p) => !definedKeys.has(p.key));
  const staleRoles = stale.length
    ? await db
        .select({ permissionId: rolePermissions.permissionId, roleName: roles.name })
        .from(rolePermissions)
        .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
        .where(
          inArray(
            rolePermissions.permissionId,
            stale.map((p) => p.id),
          ),
        )
    : [];

  const changedKeys = new Set(changes.map((c) => c.key));
  return {
    defined: DEFINITIONS.length,
    unchanged: DEFINITIONS.length - toAdd.length - changedKeys.size,
    toAdd: [...toAdd],
    changes,
    toRemove: stale.map((p) => ({
      key: p.key,
      module: p.module,
      roles: staleRoles.filter((r) => r.permissionId === p.id).map((r) => r.roleName),
    })),
  };
}

/**
 * Thêm permission mới, đưa module / method / URL / loại về đúng như code
 * (giữ nguyên mô tả admin đã nhập); tuỳ chọn xoá permission không còn trong code.
 */
export async function applyPermissionSync(
  db: Database,
  { removeStale = false }: { removeStale?: boolean } = {},
): Promise<PermissionSyncResult> {
  const preview = await previewPermissionSync(db);
  const changedKeys = [...new Set(preview.changes.map((c) => c.key))];

  return db.transaction(async (tx) => {
    if (preview.toAdd.length) {
      await tx
        .insert(permissions)
        .values(
          preview.toAdd.map((p) => ({
            key: p.key,
            module: p.module,
            type: p.type,
            method: p.method,
            apiPath: p.apiPath,
          })),
        )
        .onConflictDoNothing({ target: permissions.key });
    }
    for (const key of changedKeys) {
      const def = DEFINITIONS.find((d) => d.key === key)!;
      await tx
        .update(permissions)
        .set({ module: def.module, type: def.type, method: def.method, apiPath: def.apiPath })
        .where(eq(permissions.key, key));
    }
    if (removeStale && preview.toRemove.length) {
      await tx.delete(permissions).where(
        inArray(
          permissions.key,
          preview.toRemove.map((p) => p.key),
        ),
      );
    }
    return {
      added: preview.toAdd.length,
      updated: changedKeys.length,
      removed: removeStale ? preview.toRemove.length : 0,
    };
  });
}

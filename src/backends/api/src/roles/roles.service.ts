import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  permissions,
  rolePermissions,
  roles,
  users,
  type Role,
} from '@base/db';
import type {
  createRoleSchema,
  listRolesQuerySchema,
  PermissionKey,
  RoleDto,
  updateRoleSchema,
} from '@base/shared';
import { badRequest, conflict, forbidden, notFound } from '@base/server-kit';
import type { z } from 'zod';
import { InjectDb, type Database, type DbOrTx } from '../core/database';

type ListQuery = z.infer<typeof listRolesQuerySchema>;
type CreateInput = z.infer<typeof createRoleSchema>;
type UpdateInput = z.infer<typeof updateRoleSchema>;

const ADMIN_ACCESS: PermissionKey = 'admin.access';

@Injectable()
export class RolesService {
  constructor(@InjectDb() private readonly db: Database) {}

  /** Gắn danh sách quyền và số user cho các role */
  private async hydrate(rows: Role[]): Promise<RoleDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [perms, counts] = await Promise.all([
      this.db
        .select({ roleId: rolePermissions.roleId, key: permissions.key })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(inArray(rolePermissions.roleId, ids)),
      this.db
        .select({ roleId: users.roleId, value: count() })
        .from(users)
        .where(inArray(users.roleId, ids))
        .groupBy(users.roleId),
    ]);

    return rows.map((r) => {
      const keys = perms.filter((p) => p.roleId === r.id).map((p) => p.key as PermissionKey);
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        isActive: r.isActive,
        isSystem: r.isSystem,
        adminAccess: keys.includes(ADMIN_ACCESS),
        permissions: keys,
        userCount: counts.find((c) => c.roleId === r.id)?.value ?? 0,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Bật/tắt cờ "được vào trang admin" = thêm/xoá quyền `admin.access` của role.
   * Dùng chung permission thay vì cột riêng để chỉ có một nguồn sự thật (đăng nhập admin
   * vẫn kiểm tra `canAccessAdmin` như cũ).
   */
  private async setAdminAccess(tx: DbOrTx, roleId: string, enabled: boolean) {
    const [perm] = await tx
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, ADMIN_ACCESS));
    if (!perm) {
      // Quyền chưa được đồng bộ vào DB: tắt thì coi như đã tắt, bật thì báo lỗi rõ ràng
      if (enabled) throw badRequest('roles.adminPermissionMissing');
      return;
    }
    if (enabled) {
      await tx.insert(rolePermissions).values({ roleId, permissionId: perm.id }).onConflictDoNothing();
    } else {
      await tx
        .delete(rolePermissions)
        .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, perm.id)));
    }
  }

  private async findOrThrow(id: string): Promise<Role> {
    const [role] = await this.db.select().from(roles).where(eq(roles.id, id));
    if (!role) throw notFound('roles.notFound');
    return role;
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const [existing] = await this.db.select({ id: roles.id }).from(roles).where(eq(roles.name, name));
    if (existing && existing.id !== exceptId) throw conflict('roles.nameExists');
  }

  async list({ page, pageSize, search, sortBy, sortOrder }: ListQuery) {
    const where = search
      ? or(ilike(roles.name, `%${search}%`), ilike(roles.description, `%${search}%`))
      : undefined;
    const column = sortBy === 'name' ? roles.name : roles.createdAt;
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(roles)
        .where(where)
        .orderBy((sortOrder === 'asc' ? asc : desc)(column))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(roles).where(where),
    ]);
    return { items: await this.hydrate(rows), meta: { page, pageSize, total: total?.value ?? 0 } };
  }

  async getById(id: string): Promise<RoleDto> {
    const [dto] = await this.hydrate([await this.findOrThrow(id)]);
    return dto!;
  }

  async create({ cloneFromRoleId, adminAccess, ...input }: CreateInput) {
    await this.assertNameFree(input.name);
    // Kiểm tra role nguồn trước khi ghi để không tạo role "mồ côi" khi id sai
    if (cloneFromRoleId) await this.findOrThrow(cloneFromRoleId);
    const values = {
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive,
    };
    const id = await this.db.transaction(async (tx) => {
      const [role] = await tx.insert(roles).values(values).returning({ id: roles.id });
      if (cloneFromRoleId) {
        const source = await tx
          .select({ permissionId: rolePermissions.permissionId })
          .from(rolePermissions)
          .where(eq(rolePermissions.roleId, cloneFromRoleId));
        if (source.length) {
          await tx
            .insert(rolePermissions)
            .values(source.map((p) => ({ roleId: role!.id, permissionId: p.permissionId })));
        }
      }
      // Áp sau khi sao chép để cờ chọn trong form ghi đè quyền của role nguồn
      if (adminAccess !== undefined) await this.setAdminAccess(tx, role!.id, adminAccess);
      return role!.id;
    });
    return this.getById(id);
  }

  async update(id: string, { adminAccess, ...input }: UpdateInput) {
    const role = await this.findOrThrow(id);
    if (role.isSystem && ((input.name && input.name !== role.name) || input.isActive === false)) {
      throw forbidden('roles.systemRole');
    }
    if (input.name) await this.assertNameFree(input.name, id);
    await this.db.transaction(async (tx) => {
      if (Object.keys(input).length) await tx.update(roles).set(input).where(eq(roles.id, id));
      if (adminAccess !== undefined) await this.setAdminAccess(tx, id, adminAccess);
    });
    return this.getById(id);
  }

  async remove(id: string) {
    const role = await this.findOrThrow(id);
    if (role.isSystem) throw forbidden('roles.systemRole');
    const [usage] = await this.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.roleId, id));
    if (usage?.value) throw conflict('roles.inUse', { count: usage.value });
    await this.db.delete(roles).where(eq(roles.id, id));
  }

  /** Thay toàn bộ quyền của role bằng danh sách mới */
  async setPermissions(id: string, keys: PermissionKey[]) {
    await this.findOrThrow(id);
    await this.db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      if (!keys.length) return;
      const rows = await tx
        .select({ id: permissions.id })
        .from(permissions)
        .where(inArray(permissions.key, keys));
      if (rows.length) {
        await tx.insert(rolePermissions).values(rows.map((p) => ({ roleId: id, permissionId: p.id })));
      }
    });
    return this.getById(id);
  }
}

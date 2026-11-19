import { ensureBusinessRoles, eq, permissions, rolePermissions, roles } from '@base/db';
import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } from '@base/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers/app';

describe('Phân quyền bán hàng: vai trò mặc định', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  const roleKeys = async (name: string) => {
    const rows = await t.db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(roles.name, name));
    return rows.map((r) => r.key).sort();
  };

  it('seed tạo Manager / Staff với đúng bộ quyền mặc định; Staff không vào được trang admin', async () => {
    expect(await roleKeys(SYSTEM_ROLES.MANAGER)).toEqual(
      [...DEFAULT_ROLE_PERMISSIONS.Manager].sort(),
    );
    const staff = await roleKeys(SYSTEM_ROLES.STAFF);
    expect(staff).toEqual([...DEFAULT_ROLE_PERMISSIONS.Staff].sort());
    expect(staff).not.toContain('admin.access');
    expect(staff).not.toContain('products.viewCost');
  });

  it('Administrator có mọi quyền mới; role User không có quyền bán hàng', async () => {
    const admin = await roleKeys(SYSTEM_ROLES.ADMINISTRATOR);
    expect(admin).toEqual(
      expect.arrayContaining(['sales.create', 'reports.profit', 'inventory.adjust']),
    );
    expect((await roleKeys(SYSTEM_ROLES.USER)).filter((k) => k.startsWith('sales.'))).toEqual([]);
  });

  it('seed lại không ghi đè quyền admin đã chỉnh cho Manager / Staff', async () => {
    const [staff] = await t.db.select().from(roles).where(eq(roles.name, SYSTEM_ROLES.STAFF));
    const [pay] = await t.db.select().from(permissions).where(eq(permissions.key, 'sales.pay'));
    await t.db.delete(rolePermissions).where(eq(rolePermissions.permissionId, pay!.id));
    const result = await ensureBusinessRoles(t.db);
    expect(result).toEqual({ created: [], existing: ['Manager', 'Staff'] });
    expect(await roleKeys(SYSTEM_ROLES.STAFF)).not.toContain('sales.pay');
    // trả lại để không ảnh hưởng file test khác
    await t.db.insert(rolePermissions).values({ roleId: staff!.id, permissionId: pay!.id });
  });
});

import { hashPassword } from '@base/server-kit/password';
import { SETTING_DEFINITIONS, SYSTEM_ROLES } from '@base/shared';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import {
  applyPermissionSync,
  ensureBusinessRoles,
  createDb,
  permissions,
  rolePermissions,
  roles,
  settings,
  users,
} from '../src';

// Dùng chung file .env với API (biến đã đặt sẵn trong môi trường được ưu tiên)
config({ path: '../../backends/api/.env', quiet: true });

/**
 * Seed idempotent (chạy nhiều lần không sao):
 * 1. Đồng bộ permission từ code
 * 2. Tạo role Administrator (toàn quyền), User (mặc định khi đăng ký), Manager và Staff
 * 3. Tạo các setting mặc định còn thiếu
 * 4. Tạo tài khoản super admin
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error('Thiếu DATABASE_URL (đặt trong src/backends/api/.env hoặc biến môi trường)');

  const { db, pool } = createDb(url, { max: 1 });
  try {
    // --prune: xoá permission không còn trong code
    const sync = await applyPermissionSync(db, { removeStale: process.argv.includes('--prune') });
    console.log(`Permission: thêm ${sync.added}, cập nhật ${sync.updated}, xoá ${sync.removed}`);

    await db
      .insert(roles)
      .values([
        {
          name: SYSTEM_ROLES.ADMINISTRATOR,
          description: 'Toàn quyền quản trị hệ thống',
          isSystem: true,
        },
        { name: SYSTEM_ROLES.USER, description: 'Người dùng thông thường', isSystem: true },
      ])
      .onConflictDoNothing({ target: roles.name });

    // Administrator luôn có đủ mọi permission
    const [adminRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, SYSTEM_ROLES.ADMINISTRATOR));
    const allPermissions = await db.select({ id: permissions.id }).from(permissions);
    if (adminRole && allPermissions.length) {
      await db
        .insert(rolePermissions)
        .values(allPermissions.map((p) => ({ roleId: adminRole.id, permissionId: p.id })))
        .onConflictDoNothing();
    }

    // Vai trò nghiệp vụ bán hàng: chỉ gán quyền mặc định khi vừa tạo
    const business = await ensureBusinessRoles(db);
    if (business.created.length) console.log(`Role: đã tạo ${business.created.join(', ')}`);
    if (business.existing.length) {
      console.log(`Role ${business.existing.join(', ')} đã tồn tại, giữ nguyên quyền hiện có`);
    }

    const insertedSettings = await db
      .insert(settings)
      .values(SETTING_DEFINITIONS.map((d) => ({ name: d.name, value: d.defaultValue })))
      .onConflictDoNothing({ target: settings.name })
      .returning({ id: settings.id });
    console.log(`Setting: thêm ${insertedSettings.length} key mặc định`);

    const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';
    const inserted = await db
      .insert(users)
      .values({
        email,
        firstName: 'Super',
        lastName: 'Admin',
        passwordHash: await hashPassword(password),
        isSuperAdmin: true,
        emailVerifiedAt: new Date(),
        roleId: adminRole?.id ?? null,
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    console.log(
      inserted.length > 0
        ? `Đã tạo tài khoản super admin: ${email}`
        : `Tài khoản ${email} đã tồn tại, bỏ qua`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

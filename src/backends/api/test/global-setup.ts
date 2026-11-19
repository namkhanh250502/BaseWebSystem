import path from 'node:path';
import {
  applyPermissionSync,
  createDb,
  permissions,
  rolePermissions,
  roles,
  settings,
} from '@base/db';
import { SETTING_DEFINITIONS, SYSTEM_ROLES } from '@base/shared';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';
import { REPO_ROOT, testDatabaseUrl } from './test-env';

/** Tạo lại database test, chạy migration và seed dữ liệu nền (permission, role, setting) */
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Từ chối xoá database không phải test: ${dbName}`);

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const { db, pool } = createDb(url.toString(), { max: 1 });
  try {
    await migrate(db, { migrationsFolder: path.join(REPO_ROOT, 'src/packages/db/migrations') });
    await applyPermissionSync(db, { removeStale: false });
    await db
      .insert(roles)
      .values([
        { name: SYSTEM_ROLES.ADMINISTRATOR, description: 'Admin', isSystem: true },
        { name: SYSTEM_ROLES.USER, description: 'User', isSystem: true },
      ])
      .onConflictDoNothing({ target: roles.name });
    const [adminRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, SYSTEM_ROLES.ADMINISTRATOR));
    const all = await db.select({ id: permissions.id }).from(permissions);
    await db
      .insert(rolePermissions)
      .values(all.map((p) => ({ roleId: adminRole!.id, permissionId: p.id })))
      .onConflictDoNothing();
    await db
      .insert(settings)
      .values(SETTING_DEFINITIONS.map((d) => ({ name: d.name, value: d.defaultValue })))
      .onConflictDoNothing({ target: settings.name });
  } finally {
    await pool.end();
  }
}

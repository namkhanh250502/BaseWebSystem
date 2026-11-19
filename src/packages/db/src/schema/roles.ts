import { boolean, pgTable, primaryKey, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';

export const roles = pgTable('roles', {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 100 }).notNull().unique(),
  description: text(),
  isActive: boolean().notNull().default(true),
  /** Role do hệ thống tạo (seed), không cho xóa */
  isSystem: boolean().notNull().default(false),
  ...timestamps,
});

/** Mỗi permission ứng với 1 API (method + apiPath) hoặc là quyền giao diện (type CLIENT) */
export const permissions = pgTable('permissions', {
  id: uuid().primaryKey().defaultRandom(),
  /** Định danh cố định dùng để kiểm tra quyền */
  key: varchar({ length: 100 }).notNull().unique(),
  module: varchar({ length: 50 }).notNull(),
  /** 'SERVER' | 'CLIENT' */
  type: varchar({ length: 10 }).notNull().default('SERVER'),
  method: varchar({ length: 10 }),
  apiPath: varchar({ length: 255 }),
  description: text(),
  ...timestamps,
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid()
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;

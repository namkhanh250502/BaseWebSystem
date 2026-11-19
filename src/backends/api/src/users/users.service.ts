import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  roles,
  users,
  type NewUser,
  type SQL,
} from '@base/db';
import type { createUserSchema, listUsersQuerySchema, updateUserSchema } from '@base/shared';
import {
  badRequest,
  conflict,
  forbidden,
  generatePassword,
  hashPassword,
  notFound,
} from '@base/server-kit';
import type { z } from 'zod';
import type { Principal } from '../auth/principal';
import { SessionService } from '../auth/session.service';
import { TwoFactorService } from '../auth/two-factor/two-factor.service';
import { InjectDb, type Database } from '../core/database';
import { toUserDto } from './user.mapper';

type ListQuery = z.infer<typeof listUsersQuerySchema>;
type CreateInput = z.infer<typeof createUserSchema>;
type UpdateInput = z.infer<typeof updateUserSchema>;

const SORT_COLUMNS = {
  email: users.email,
  firstName: users.firstName,
  createdAt: users.createdAt,
  lastLoginAt: users.lastLoginAt,
} as const;

const selection = { user: users, role: { id: roles.id, name: roles.name } };

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, '\\$&');
}

/** Nghiệp vụ quản lý user (trang admin) */
@Injectable()
export class UsersService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly sessions: SessionService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  private async findWithRole(id: string) {
    const [row] = await this.db
      .select(selection)
      .from(users)
      .leftJoin(roles, eq(roles.id, users.roleId))
      .where(eq(users.id, id))
      .limit(1);
    return row ?? null;
  }

  private async assertRoleExists(roleId: string | null | undefined) {
    if (!roleId) return;
    const [role] = await this.db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId));
    if (!role) throw badRequest('users.roleNotFound');
  }

  private async assertEmailFree(email: string, exceptId?: string) {
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (existing && existing.id !== exceptId) throw conflict('auth.emailExists');
  }

  /** Lấy user mục tiêu và kiểm tra người thao tác có được sửa user đó không */
  private async getEditableTarget(actor: Principal, id: string) {
    const row = await this.findWithRole(id);
    if (!row) throw notFound('users.notFound');
    if (row.user.isSuperAdmin && !actor.user.isSuperAdmin) {
      throw forbidden('users.cannotModifySuperAdmin');
    }
    return row;
  }

  async list({
    page,
    pageSize,
    search,
    status,
    emailVerification,
    roleId,
    sortBy,
    sortOrder,
  }: ListQuery) {
    const filters: (SQL | undefined)[] = [];
    if (search) {
      const keyword = `%${escapeLike(search)}%`;
      filters.push(
        or(
          ilike(users.email, keyword),
          ilike(users.firstName, keyword),
          ilike(users.lastName, keyword),
        ),
      );
    }
    if (status) filters.push(eq(users.isActive, status === 'active'));
    if (emailVerification) {
      filters.push(
        emailVerification === 'verified'
          ? isNotNull(users.emailVerifiedAt)
          : isNull(users.emailVerifiedAt),
      );
    }
    if (roleId) filters.push(eq(users.roleId, roleId));
    const where = and(...filters);
    const order = (sortOrder === 'asc' ? asc : desc)(SORT_COLUMNS[sortBy]);

    const [rows, [total]] = await Promise.all([
      this.db
        .select(selection)
        .from(users)
        .leftJoin(roles, eq(roles.id, users.roleId))
        .where(where)
        .orderBy(order, desc(users.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(users).where(where),
    ]);

    return {
      items: rows.map((r) => toUserDto(r.user, r.role)),
      meta: { page, pageSize, total: total?.value ?? 0 },
    };
  }

  async getById(id: string) {
    const row = await this.findWithRole(id);
    if (!row) throw notFound('users.notFound');
    return toUserDto(row.user, row.role);
  }

  async create(actor: Principal, input: CreateInput) {
    if (input.isSuperAdmin && !actor.user.isSuperAdmin) {
      throw forbidden('users.cannotModifySuperAdmin');
    }
    const email = input.email.toLowerCase();
    await this.assertEmailFree(email);
    await this.assertRoleExists(input.roleId);

    const [user] = await this.db
      .insert(users)
      .values({
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash: await hashPassword(input.password),
        roleId: input.roleId ?? null,
        isActive: input.isActive,
        isSuperAdmin: input.isSuperAdmin,
        // Tài khoản do admin tạo coi như đã xác minh email
        emailVerifiedAt: new Date(),
      })
      .returning();
    return this.getById(user!.id);
  }

  async update(actor: Principal, id: string, input: UpdateInput) {
    const { user: target } = await this.getEditableTarget(actor, id);
    const isSelf = target.id === actor.user.id;

    if (input.isSuperAdmin !== undefined && input.isSuperAdmin !== target.isSuperAdmin) {
      if (!actor.user.isSuperAdmin) throw forbidden('users.cannotModifySuperAdmin');
      if (isSelf) throw badRequest('users.cannotModifySelf');
    }
    if (isSelf && input.isActive === false) throw badRequest('users.cannotModifySelf');
    if (input.roleId !== undefined) await this.assertRoleExists(input.roleId);

    const { emailVerified, ...rest } = input;
    const data: Partial<NewUser> = { ...rest };
    if (emailVerified !== undefined && emailVerified !== (target.emailVerifiedAt !== null)) {
      data.emailVerifiedAt = emailVerified ? new Date() : null;
    }
    if (input.email) {
      data.email = input.email.toLowerCase();
      await this.assertEmailFree(data.email, id);
    }

    await this.db.update(users).set(data).where(eq(users.id, id));
    // Khóa tài khoản: đăng xuất khỏi mọi thiết bị
    if (input.isActive === false && target.isActive) await this.sessions.revokeAll(id);
    return this.getById(id);
  }

  /** Admin đặt lại mật khẩu: sinh mật khẩu ngẫu nhiên, trả về 1 lần duy nhất */
  async resetPassword(actor: Principal, id: string) {
    await this.getEditableTarget(actor, id);
    const password = generatePassword(12);
    await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(users.id, id));
    await this.sessions.revokeAll(id);
    return { password };
  }

  /** Admin tắt 2FA giúp user (ví dụ user mất thiết bị và mã dự phòng): xoá mọi phương thức + passkey */
  async disableTwoFactor(actor: Principal, id: string) {
    await this.getEditableTarget(actor, id);
    await this.twoFactor.clearAll(id);
    return this.getById(id);
  }
}

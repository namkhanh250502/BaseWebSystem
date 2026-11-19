import type { User } from '@base/db';
import { normalizeLocale, type MeDto, type RoleRef, type UserDto } from '@base/shared';
import type { Principal } from '../auth/principal';

/** Chuyển bản ghi DB sang DTO trả về client (bỏ passwordHash, secret 2FA, mã xác minh) */
export function toUserDto(user: User, role: RoleRef | null): UserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    lang: normalizeLocale(user.lang),
    isActive: user.isActive,
    isSuperAdmin: user.isSuperAdmin,
    twoFactorEnabled: user.twoFactorEnabled,
    emailVerified: user.emailVerifiedAt !== null,
    hasPassword: user.passwordHash !== null,
    googleLinked: user.googleId !== null,
    role,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toMeDto(principal: Principal): MeDto {
  return {
    ...toUserDto(principal.user, principal.role),
    permissions: principal.permissions,
    emailVerificationRequired: principal.emailVerificationRequired,
  };
}

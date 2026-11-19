import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { PermissionKey } from '@base/shared';
import { forbidden, readBearerToken, unauthorized } from '@base/server-kit';
import { setPrincipal, toRequestLike } from '../core/request-context';
import {
  ALLOW_UNVERIFIED_EMAIL_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
} from '../decorators/customize';
import { PrincipalService } from './principal';

/**
 * Guard toàn cục: mọi route bắt buộc đăng nhập trừ khi có @Public().
 * User được nạp lại từ DB ở mỗi request nên khóa tài khoản, đổi role hay đổi quyền
 * có hiệu lực ngay, không phải chờ access token hết hạn.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly principals: PrincipalService,
  ) {}

  private meta<T>(key: string, context: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.meta<boolean>(IS_PUBLIC_KEY, context)) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = readBearerToken(toRequestLike(req));
    const userId = token ? await this.principals.verifyAccessToken(token) : null;
    if (!userId) throw unauthorized();

    const principal = await this.principals.load(userId);
    if (!principal) throw unauthorized();
    if (!principal.user.isActive) throw unauthorized('auth.accountLocked');
    if (
      principal.emailVerificationRequired &&
      !this.meta<boolean>(ALLOW_UNVERIFIED_EMAIL_KEY, context)
    ) {
      throw forbidden('emailVerification.required');
    }

    // Cần ít nhất 1 trong các quyền khai báo (super admin luôn qua)
    const required = this.meta<PermissionKey[]>(PERMISSIONS_KEY, context) ?? [];
    if (required.length && !required.some((p) => principal.can(p))) throw forbidden();

    setPrincipal(req, principal);
    return true;
  }
}

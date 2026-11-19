import { Injectable, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { REAUTH_HEADER } from '@base/shared';
import { forbidden, unauthorized } from '@base/server-kit';
import { getPrincipal, getRequestContext } from '../../core/request-context';
import { TwoFactorService } from './two-factor.service';

/**
 * Thao tác nhạy cảm (thêm/xoá phương thức 2FA, tạo lại mã dự phòng, tắt 2FA) cần header
 * `x-reauth-token` lấy từ POST /me/2fa/reauth. User chưa bật 2FA thì không cần.
 * Chạy sau AuthGuard toàn cục nên principal đã có sẵn.
 */
@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(private readonly twoFactor: TwoFactorService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const principal = getPrincipal(req);
    if (!principal) throw unauthorized();
    if (!principal.user.twoFactorEnabled) return true;

    const header = req.headers[REAUTH_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    const { app } = getRequestContext(req);
    if (!token || !(await this.twoFactor.verifyReauthToken(token, principal.user.id, app))) {
      throw forbidden('twoFactor.reauthRequired');
    }
    return true;
  }
}

/** Yêu cầu xác minh lại bằng 2FA trong 5 phút gần nhất */
export const RequireReauth = () => UseGuards(ReauthGuard);

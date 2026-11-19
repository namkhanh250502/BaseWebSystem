import {
  HttpException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { AVATAR_MAX_BYTES } from '@base/shared';
import { badRequest, payloadTooLarge } from '@base/server-kit';
import { catchError, type Observable } from 'rxjs';

/**
 * Đặt trước FileInterceptor: đổi lỗi của multer (file quá lớn, sai tên field...)
 * thành lỗi có key i18n của trang tài khoản.
 */
@Injectable()
export class AvatarUploadErrorInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpException) {
          if (error.getStatus() === 413) {
            throw payloadTooLarge('account.avatarTooLarge', {
              size: `${AVATAR_MAX_BYTES / 1024 / 1024}MB`,
            });
          }
          if (error.getStatus() === 400) throw badRequest('account.avatarRequired');
        }
        throw error;
      }),
    );
  }
}

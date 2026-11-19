/*-------------------------------------------------------------------
 * Bọc dữ liệu controller trả về thành { data, error: null, meta? }
 * Docs: https://docs.nestjs.com/interceptors
 *------------------------------------------------------------------*/
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiMeta } from '@base/shared';
import { successBody } from '@base/server-kit';
import { map, type Observable } from 'rxjs';

/** Kết quả có phân trang: interceptor đưa `meta` ra cạnh `data` */
class PaginatedResult<T> {
  constructor(
    public readonly items: T[],
    public readonly meta: ApiMeta,
  ) {}
}

export const paginated = <T>({ items, meta }: { items: T[]; meta: ApiMeta }) =>
  new PaginatedResult(items, meta);

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        // 204 No Content: không có body
        if (context.switchToHttp().getResponse<Response>().statusCode === 204) return undefined;
        if (data instanceof PaginatedResult) return successBody(data.items, data.meta);
        return successBody(data ?? null);
      }),
    );
  }
}

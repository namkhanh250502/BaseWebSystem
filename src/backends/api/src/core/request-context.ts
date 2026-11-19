import type { Request } from 'express';
import { APP_HEADER, APPS, type AppName, type Locale } from '@base/shared';
import { resolveLocale, type RequestLike } from '@base/server-kit';
import type { Principal } from '../auth/principal';

/** Thông tin request mà service cần: header (IP, cookie, User-Agent...), app gọi tới, ngôn ngữ */
export interface RequestContext {
  req: RequestLike;
  /** App gọi tới (header x-app), mặc định 'user' */
  app: AppName;
  locale: Locale;
}

const CONTEXT = Symbol('requestContext');
const PRINCIPAL = Symbol('principal');

type ExtendedRequest = Request & { [CONTEXT]?: RequestContext; [PRINCIPAL]?: Principal };

/** Bọc request của Express thành dạng `headers.get()` + IP kết nối mà @base/server-kit dùng */
export function toRequestLike(req: Request): RequestLike {
  return {
    // IP kết nối TCP thật (không qua `req.ip` của Express, vốn phụ thuộc cấu hình trust proxy)
    remoteAddress: req.socket?.remoteAddress ?? null,
    headers: {
      get(name) {
        const value = req.headers[name.toLowerCase()];
        if (value === undefined) return null;
        return Array.isArray(value) ? value.join(', ') : value;
      },
      has(name) {
        return req.headers[name.toLowerCase()] !== undefined;
      },
    },
  };
}

function resolveApp(req: RequestLike): AppName {
  const value = req.headers.get(APP_HEADER);
  return (APPS as readonly string[]).includes(value ?? '') ? (value as AppName) : 'user';
}

export function getRequestContext(req: Request): RequestContext {
  const extended = req as ExtendedRequest;
  if (!extended[CONTEXT]) {
    const like = toRequestLike(req);
    extended[CONTEXT] = { req: like, app: resolveApp(like), locale: resolveLocale(like) };
  }
  return extended[CONTEXT];
}

/** Gắn user đã xác thực vào request (AuthGuard gọi) */
export function setPrincipal(req: Request, principal: Principal): void {
  (req as ExtendedRequest)[PRINCIPAL] = principal;
}

export function getPrincipal(req: Request): Principal | undefined {
  return (req as ExtendedRequest)[PRINCIPAL];
}

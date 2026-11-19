import { BlockList, isIP } from 'node:net';
import type { z } from 'zod';
import { validationError } from './errors';

/** Nguồn header tối thiểu: `Request` của Fetch API hoặc adapter từ request của Express */
export interface HeaderReader {
  get(name: string): string | null;
  has(name: string): boolean;
}

/** Request tối thiểu mà các hàm tiện ích cần (header + IP của kết nối TCP) */
export interface RequestLike {
  headers: HeaderReader;
  /**
   * IP của kết nối TCP (`req.socket.remoteAddress`). Có giá trị thì header IP (CF-Connecting-IP,
   * X-Forwarded-For, X-Real-IP) chỉ được tin khi kết nối đến từ proxy tin cậy.
   * `undefined` = adapter không biết IP kết nối (ví dụ Fetch `Request`) → tin header như cũ.
   */
  remoteAddress?: string | null;
}

/** Kiểm tra dữ liệu theo schema zod; sai thì ném lỗi 422 kèm danh sách lỗi theo trường */
export function validate<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationError(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

/** Chuẩn hoá IP: bỏ port, bỏ ngoặc vuông IPv6, bỏ tiền tố IPv4-mapped (::ffff:1.2.3.4) */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  let value = ip.trim();
  const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) value = bracketed[1]!;
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) value = value.split(':')[0]!;
  if (/^::ffff:\d{1,3}(\.\d{1,3}){3}$/i.test(value)) value = value.slice(7);
  return value ? value.slice(0, 45) : null;
}

/** Proxy mặc định được tin: chỉ loopback (nginx / cloudflared / proxy Vite chạy cùng máy) */
export const DEFAULT_TRUSTED_PROXIES = ['127.0.0.1', '::1'];

/**
 * Tạo danh sách proxy tin cậy từ các IP hoặc dải CIDR (`10.0.0.0/8`, `fd00::/8`).
 * Giá trị sai định dạng thì ném lỗi (để dừng khởi động thay vì âm thầm tin nhầm).
 */
export function parseTrustedProxies(entries: readonly string[]): BlockList {
  const list = new BlockList();
  for (const raw of entries) {
    const entry = raw.trim();
    if (!entry) continue;
    const [address = '', prefix] = entry.split('/');
    const family = isIP(address);
    if (!family) throw new Error(`Proxy tin cậy không hợp lệ: "${entry}"`);
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) {
      list.addAddress(address, type);
      continue;
    }
    const bits = Number(prefix);
    if (!/^\d+$/.test(prefix) || bits > (family === 4 ? 32 : 128))
      throw new Error(`Proxy tin cậy không hợp lệ: "${entry}"`);
    list.addSubnet(address, bits, type);
  }
  return list;
}

let trustedProxies = parseTrustedProxies(DEFAULT_TRUSTED_PROXIES);

/** Đặt danh sách proxy tin cậy cho `getClientIp` (gọi 1 lần lúc khởi động) */
export function configureTrustedProxies(entries: readonly string[]): void {
  trustedProxies = parseTrustedProxies(entries);
}

function isTrustedProxy(ip: string | null): boolean {
  if (!ip) return false;
  const family = isIP(ip);
  return family !== 0 && trustedProxies.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * IP thật của client.
 *
 * Header IP chỉ được tin khi kết nối TCP đến từ proxy tin cậy (`configureTrustedProxies`, mặc định
 * loopback). Ai gọi thẳng vào API kèm header giả sẽ bị lấy IP của kết nối.
 * Khi kết nối đến từ proxy tin cậy:
 * - Sau Cloudflare: dùng `CF-Connecting-IP` (Cloudflare tự đặt, ghi đè giá trị client gửi lên).
 *   Điều kiện: nginx/origin chỉ nhận traffic từ Cloudflare (Tunnel + nginx nghe 127.0.0.1, hoặc
 *   firewall theo dải IP Cloudflare), nếu không client gọi thẳng nginx kèm CF-Connecting-IP giả.
 * - Không có Cloudflare: X-Forwarded-For đọc từ PHẢI sang TRÁI, bỏ qua các proxy tin cậy (mỗi proxy
 *   chỉ nối thêm vào cuối, nên các phần tử bên trái do client tự gửi và giả mạo được) → X-Real-IP.
 */
export function getClientIp(req: RequestLike): string | null {
  const peer = req.remoteAddress === undefined ? undefined : normalizeIp(req.remoteAddress);
  if (peer !== undefined && !isTrustedProxy(peer)) return peer;

  const cloudflare = normalizeIp(req.headers.get('cf-connecting-ip'));
  if (cloudflare) return cloudflare;

  const forwarded = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((part) => normalizeIp(part))
    .filter((ip): ip is string => ip !== null);
  if (forwarded.length > 0) {
    for (let i = forwarded.length - 1; i >= 0; i--) {
      if (!isTrustedProxy(forwarded[i]!)) return forwarded[i]!;
    }
    return forwarded[0]!;
  }

  return normalizeIp(req.headers.get('x-real-ip')) ?? peer ?? null;
}

/** Đọc 1 cookie từ header Cookie */
export function readCookie(req: RequestLike, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export interface CookieOptions {
  maxAgeSeconds: number;
  path?: string;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? '/'}`,
    `Max-Age=${options.maxAgeSeconds}`,
    'HttpOnly',
    `SameSite=${options.sameSite ?? 'Lax'}`,
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

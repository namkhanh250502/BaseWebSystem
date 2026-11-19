import { SignJWT, jwtVerify } from 'jose';
import type { RequestLike } from './request';

const encoder = new TextEncoder();

/**
 * Ký JWT HS256. `audience` phân biệt loại token (access, 2fa...) để token loại này
 * không dùng thay được cho loại khác.
 */
export async function signJwt(options: {
  subject: string;
  audience: string;
  secret: string;
  /**
   * Chuỗi thời lượng tương đối ('15m', '300s', '7d'). CẢNH BÁO: số nguyên được jose hiểu là
   * thời điểm hết hạn tuyệt đối (giây kể từ epoch), không phải số giây.
   */
  expiresIn: string | number;
  claims?: Record<string, unknown>;
}): Promise<string> {
  return new SignJWT(options.claims ?? {})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(options.subject)
    .setAudience(options.audience)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn)
    .sign(encoder.encode(options.secret));
}

/** Trả về subject (id user) nếu token hợp lệ, ngược lại null */
export async function verifyJwt(
  token: string,
  secret: string,
  audience: string,
): Promise<{ subject: string; claims: Record<string, unknown> } | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), {
      algorithms: ['HS256'],
      audience,
    });
    if (typeof payload.sub !== 'string') return null;
    return { subject: payload.sub, claims: payload };
  } catch {
    return null;
  }
}

export function readBearerToken(req: RequestLike): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

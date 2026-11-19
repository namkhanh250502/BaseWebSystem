import type { LoginLocation } from '@base/shared';
import { logger } from './logger';
import { normalizeIp, type RequestLike } from './request';

/**
 * Xác định vị trí từ IP:
 * 1. Header Cloudflare: `cf-ipcountry` luôn có; `cf-ipcity`, `cf-region` cần bật Managed Transform
 *    "Add visitor location headers" (Rules → Transform Rules → Managed Transforms). Vercel tương tự.
 *    Miễn phí, không gọi ra ngoài.
 * 2. Header thiếu thành phố → tra IP qua ipwho.is (HTTPS, không cần key), có cache trong bộ nhớ.
 */

/** IP mạng nội bộ / loopback / link-local / CGNAT: không có vị trí địa lý */
export function isPrivateIp(ip: string | null | undefined): boolean {
  const value = normalizeIp(ip);
  if (!value) return false;
  const v4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = value.toLowerCase();
  return v6 === '::1' || v6 === '::' || /^f[cd][0-9a-f]{2}:/.test(v6) || /^fe[89ab][0-9a-f]:/.test(v6);
}

/**
 * Cloudflare gửi tên thành phố / vùng dạng UTF-8 thô, còn Node đọc header theo latin1
 * ("Hà Nội" thành "HÃ  Ná»™i") → đọc lại bytes theo UTF-8. Vercel thì URL-encode.
 */
function decodeHeaderValue(value: string): string {
  // Có ký tự 0x80–0xFF và không có ký tự nào > 0xFF → nhiều khả năng là bytes UTF-8
  if (/[\u0080-ÿ]/.test(value) && ![...value].some((c) => c.charCodeAt(0) > 0xff)) {
    const utf8 = Buffer.from(value, 'latin1').toString('utf8');
    if (!utf8.includes('�')) return utf8;
  }
  if (value.includes('%')) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return value;
}

function header(req: RequestLike, name: string): string | null {
  const value = req.headers.get(name)?.trim();
  return value ? decodeHeaderValue(value) : null;
}

const clip = (value: string | null | undefined, max = 100) => (value ? value.slice(0, max) : null);

let warnedMissingCity = false;

/** Vị trí từ header Cloudflare / Vercel; null nếu không có thông tin nào */
export function getLocationFromHeaders(req: RequestLike): LoginLocation | null {
  const rawCountry = header(req, 'cf-ipcountry') ?? header(req, 'x-vercel-ip-country');
  const region = clip(header(req, 'cf-region') ?? header(req, 'x-vercel-ip-country-region'));
  const city = clip(header(req, 'cf-ipcity') ?? header(req, 'x-vercel-ip-city'));

  if (rawCountry && !city && !warnedMissingCity && req.headers.has('cf-ray')) {
    warnedMissingCity = true;
    logger.warn(
      'Cloudflare chưa gửi cf-ipcity: bật Rules → Transform Rules → Managed Transforms → ' +
        '"Add visitor location headers" để có thành phố mà không phải tra IP qua dịch vụ ngoài.',
    );
  }

  // Cloudflare: XX = không xác định, T1 = mạng Tor
  if (rawCountry?.toUpperCase() === 'T1') {
    return { countryCode: null, country: 'Tor', region: null, city: null };
  }
  const countryCode =
    rawCountry && /^[A-Z]{2}$/i.test(rawCountry) && rawCountry.toUpperCase() !== 'XX'
      ? rawCountry.toUpperCase()
      : null;
  if (!countryCode && !region && !city) return null;
  return { countryCode, country: null, region, city };
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILED_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 2000;
const cache = new Map<string, { value: LoginLocation | null; expiresAt: number }>();

function remember(ip: string, value: LoginLocation | null, ttl: number) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(ip, { value, expiresAt: Date.now() + ttl });
}

interface IpWhoResponse {
  success?: boolean;
  message?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
}

/** Tra cứu vị trí của IP công khai. Trả null nếu không tra được (không ném lỗi). */
export async function lookupIpLocation(ip: string, timeoutMs = 3000): Promise<LoginLocation | null> {
  const value = normalizeIp(ip);
  if (!value || isPrivateIp(value)) return null;

  const cached = cache.get(value);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(value)}?fields=success,message,country,country_code,region,city`,
      { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as IpWhoResponse;
    if (!json.success) throw new Error(json.message ?? 'lookup failed');
    const location: LoginLocation = {
      countryCode:
        json.country_code && /^[A-Z]{2}$/i.test(json.country_code)
          ? json.country_code.toUpperCase()
          : null,
      country: clip(json.country),
      region: clip(json.region),
      city: clip(json.city),
    };
    remember(value, location, CACHE_TTL_MS);
    return location;
  } catch (error) {
    logger.warn(`Không tra được vị trí của IP ${value}`, error);
    remember(value, null, FAILED_TTL_MS);
    return null;
  }
}

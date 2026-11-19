import type { DeviceInfo, DeviceType } from '@base/shared';

/**
 * Phân tích User-Agent ở mức đủ để hiển thị (trình duyệt, hệ điều hành, loại thiết bị).
 * Không cố nhận diện mọi trường hợp; chuỗi gốc vẫn được lưu để xem chi tiết.
 */

/** Thứ tự quan trọng: các trình duyệt nhân Chromium phải đứng trước Chrome, Chrome trước Safari */
const BROWSERS: Array<[name: string, pattern: RegExp]> = [
  ['Zalo', /Zalo(?:Theme)?\/?([\d.]+)?/i],
  ['Facebook', /\b(?:FBAN|FBAV)\/([\d.]+)?/],
  ['Instagram', /Instagram ([\d.]+)/],
  ['Cốc Cốc', /coc_coc_browser\/([\d.]+)/i],
  ['Edge', /\bEdg(?:e|A|iOS)?\/([\d.]+)/],
  ['Opera', /\b(?:OPR|OPiOS|Opera)\/([\d.]+)/],
  ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
  ['Yandex', /YaBrowser\/([\d.]+)/],
  ['UC Browser', /UCBrowser\/([\d.]+)/],
  ['Vivaldi', /Vivaldi\/([\d.]+)/],
  ['Firefox', /\b(?:Firefox|FxiOS)\/([\d.]+)/],
  ['Chrome', /\b(?:CriOS|Chrome|HeadlessChrome)\/([\d.]+)/],
  ['Safari', /Version\/([\d.]+).*Safari\//],
  ['Internet Explorer', /(?:MSIE |Trident\/.*rv:)([\d.]+)/],
];

const WINDOWS_VERSIONS: Record<string, string> = {
  '10.0': '10/11',
  '6.3': '8.1',
  '6.2': '8',
  '6.1': '7',
  '6.0': 'Vista',
  '5.1': 'XP',
};

const BOT_PATTERN =
  /bot\b|crawler|spider|slurp|curl\/|wget\/|python-requests|httpclient|okhttp|postmanruntime|insomnia|axios\/|node-fetch|undici|headless/i;

/** Bỏ phần patch để gọn: 142.0.7444.59 → 142 (giữ 2 phần với hệ điều hành) */
function shortVersion(version: string | undefined, parts = 1): string | null {
  if (!version) return null;
  return version.replace(/_/g, '.').split('.').slice(0, parts).join('.') || null;
}

function detectOs(ua: string): Pick<DeviceInfo, 'os' | 'osVersion' | 'model'> {
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Windows Phone(?: OS)? ([\d.]+)/))) {
    return { os: 'Windows Phone', osVersion: shortVersion(m[1], 2), model: null };
  }
  if ((m = ua.match(/Windows NT ([\d.]+)/))) {
    return { os: 'Windows', osVersion: WINDOWS_VERSIONS[m[1]!] ?? m[1]!, model: null };
  }
  if ((m = ua.match(/\b(iPhone|iPad|iPod)\b.*? OS ([\d_]+)/))) {
    return { os: m[1] === 'iPad' ? 'iPadOS' : 'iOS', osVersion: shortVersion(m[2], 2), model: m[1]! };
  }
  if ((m = ua.match(/Android(?: ([\d.]+))?/))) {
    // "Android 14; SM-S918B Build/..." hoặc UA rút gọn của Chrome mới "Android 10; K"
    const model = ua.match(/Android[^;)]*;(?: [a-z]{2}[-_][a-z]{2};)? ([^;)]+?)(?: Build\/|\))/i)?.[1];
    return {
      os: 'Android',
      osVersion: shortVersion(m[1], 2),
      model: model && model.length > 1 && !/^wv$/i.test(model) ? model.trim() : null,
    };
  }
  if (/CrOS/.test(ua)) return { os: 'ChromeOS', osVersion: null, model: null };
  // macOS: trình duyệt hiện đại cố định "10_15_7" nên không hiển thị phiên bản
  if (/Mac OS X|Macintosh/.test(ua)) return { os: 'macOS', osVersion: null, model: null };
  if (/Ubuntu/.test(ua)) return { os: 'Ubuntu', osVersion: null, model: null };
  if (/Linux|X11/.test(ua)) return { os: 'Linux', osVersion: null, model: null };
  return { os: null, osVersion: null, model: null };
}

function detectType(ua: string, os: string | null): DeviceType {
  if (BOT_PATTERN.test(ua)) return 'bot';
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (os === 'Android' && !/Mobile/.test(ua))) {
    return 'tablet';
  }
  if (/Mobi|iPhone|iPod|Windows Phone|Opera Mini/i.test(ua)) return 'mobile';
  if (os === 'Windows' || os === 'macOS' || os === 'Linux' || os === 'Ubuntu' || os === 'ChromeOS') {
    return 'desktop';
  }
  return 'unknown';
}

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua) {
    return { type: 'unknown', browser: null, browserVersion: null, os: null, osVersion: null, model: null };
  }
  const { os, osVersion, model } = detectOs(ua);
  let browser: string | null = null;
  let browserVersion: string | null = null;
  for (const [name, pattern] of BROWSERS) {
    const m = ua.match(pattern);
    if (m) {
      browser = name;
      browserVersion = shortVersion(m[1]);
      break;
    }
  }
  return { type: detectType(ua, os), browser, browserVersion, os, osVersion, model };
}

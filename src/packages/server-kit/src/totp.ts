import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';

/** Secret TOTP mới (Base32) */
export function generateTotpSecret(): string {
  return generateSecret();
}

export function buildOtpauthUrl(options: {
  issuer: string;
  label: string;
  secret: string;
}): string {
  return generateURI({ issuer: options.issuer, label: options.label, secret: options.secret });
}

/**
 * Kiểm tra mã 6 số, chấp nhận lệch ±1 bước (30 giây) do đồng hồ không khớp.
 * Đúng thì trả về bước thời gian (RFC 6238) mà mã thuộc về, sai thì `null`.
 * Muốn chặn dùng lại mã: lưu bước này và từ chối mã có bước <= bước đã lưu (xem TotpMethod).
 */
export async function matchTotp(secret: string, code: string): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  try {
    const result = await verify({ secret, token: code, epochTolerance: 30 });
    // `verify` dùng chung cho HOTP/TOTP; chỉ kết quả TOTP mới có `timeStep`
    return result.valid && 'timeStep' in result ? result.timeStep : null;
  } catch {
    return null;
  }
}

/** Như `matchTotp` nhưng chỉ trả về đúng/sai (KHÔNG chặn dùng lại mã) */
export async function verifyTotp(secret: string, code: string): Promise<boolean> {
  return (await matchTotp(secret, code)) !== null;
}

/** QR code dạng data URL (PNG) để hiển thị trực tiếp trong thẻ <img> */
export function toQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 240 });
}

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Token ngẫu nhiên dạng hex (mặc định 32 byte = 64 ký tự) */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

function toKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/** Mã hóa AES-256-GCM, kết quả dạng `iv:tag:data` (hex) */
export function encrypt(plainText: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', toKey(secret), iv);
  const data = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join(':');
}

export function decrypt(payload: string, secret: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Dữ liệu mã hóa không hợp lệ');
  const decipher = createDecipheriv('aes-256-gcm', toKey(secret), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString(
    'utf8',
  );
}

// Bỏ các ký tự dễ nhầm (0/O, 1/I/l)
const READABLE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomString(length: number, alphabet: string): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Sinh mã dự phòng 2FA dạng `XXXX-XXXX` */
export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomString(8, READABLE);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

/** Chuẩn hoá mã dự phòng người dùng nhập (bỏ khoảng trắng, gạch, viết hoa) trước khi hash */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/** Sinh mật khẩu ngẫu nhiên, luôn có chữ thường, chữ hoa và chữ số */
export function generatePassword(length = 12): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lower + upper + digits;
  const chars = [
    randomString(1, lower),
    randomString(1, upper),
    randomString(1, digits),
    ...randomString(length - 3, all),
  ];
  // Fisher–Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

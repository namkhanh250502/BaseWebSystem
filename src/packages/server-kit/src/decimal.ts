/**
 * Số thập phân chính xác cho tiền và số lượng: lưu dạng BigInt "đơn vị nhỏ nhất" kèm scale cố định,
 * không bao giờ đi qua số thực JS (constitution VII). Đầu vào/đầu ra là chuỗi giống kiểu `numeric`
 * của PostgreSQL mà Drizzle trả về (vd. "125000.00").
 *
 * Làm tròn: half-up tính theo trị tuyệt đối (0.5 → 1, -0.5 → -1), áp dụng khi giảm scale và khi chia.
 */

/** Scale của tiền (`numeric(18,2)`) */
export const MONEY_SCALE = 2;
/** Scale của giá vốn đơn vị / bình quân (`numeric(18,4)`) */
export const COST_SCALE = 4;
/** Scale của số lượng (`numeric(14,3)`) */
export const QUANTITY_SCALE = 3;

export interface Decimal {
  /** Giá trị nhân 10^scale */
  readonly units: bigint;
  readonly scale: number;
}

const DECIMAL_PATTERN = /^([+-])?(\d+)(?:\.(\d+))?$/;

function pow10(exp: number): bigint {
  return 10n ** BigInt(exp);
}

function assertScale(scale: number) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
    throw new RangeError(`Scale không hợp lệ: ${scale}`);
  }
}

/** Chia nguyên làm tròn half-up theo trị tuyệt đối */
function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Chia cho 0');
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  const absRemainder2 = (remainder < 0n ? -remainder : remainder) * 2n;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  if (absRemainder2 < absDenominator) return quotient;
  const negative = numerator < 0n !== denominator < 0n;
  return negative ? quotient - 1n : quotient + 1n;
}

function rescaleUnits(units: bigint, from: number, to: number): bigint {
  if (to === from) return units;
  return to > from ? units * pow10(to - from) : divRound(units, pow10(from - to));
}

/**
 * Tạo số thập phân. Chuỗi có nhiều chữ số lẻ hơn `scale` được làm tròn half-up.
 * `number` chỉ nhận số nguyên an toàn (số thực JS không chính xác).
 */
export function decimal(value: string | number | bigint | Decimal, scale = MONEY_SCALE): Decimal {
  assertScale(scale);
  if (typeof value === 'object') return rescale(value, scale);
  if (typeof value === 'bigint') return { units: value * pow10(scale), scale };
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`Chỉ nhận số nguyên an toàn, hãy truyền chuỗi thập phân: ${value}`);
    }
    return { units: BigInt(value) * pow10(scale), scale };
  }

  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) throw new TypeError(`Không phải số thập phân hợp lệ: "${value}"`);
  const [, sign, integerPart, fraction = ''] = match;
  const units = rescaleUnits(BigInt(integerPart + fraction), fraction.length, scale);
  return { units: sign === '-' ? -units : units, scale };
}

/** Kiểm tra chuỗi có phải số thập phân hợp lệ (tuỳ chọn giới hạn số chữ số lẻ) */
export function isDecimalString(value: string, maxScale?: number): boolean {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) return false;
  return maxScale === undefined || (match[3] ?? '').length <= maxScale;
}

/** Đổi scale (giảm scale thì làm tròn half-up) */
export function rescale(value: Decimal, scale: number): Decimal {
  assertScale(scale);
  return { units: rescaleUnits(value.units, value.scale, scale), scale };
}

/** Chuỗi đủ `scale` chữ số lẻ, vd. "125000.00", "-0.50", "3.000" */
export function decimalToString(value: Decimal): string {
  const negative = value.units < 0n;
  const digits = (negative ? -value.units : value.units).toString().padStart(value.scale + 1, '0');
  const integerPart = value.scale ? digits.slice(0, -value.scale) : digits;
  const fraction = value.scale ? `.${digits.slice(-value.scale)}` : '';
  return `${negative ? '-' : ''}${integerPart}${fraction}`;
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [rescaleUnits(a.units, a.scale, scale), rescaleUnits(b.units, b.scale, scale), scale];
}

/** a + b (scale = scale lớn hơn của hai số) */
export function add(a: Decimal, b: Decimal): Decimal {
  const [x, y, scale] = align(a, b);
  return { units: x + y, scale };
}

/** a − b (scale = scale lớn hơn của hai số) */
export function sub(a: Decimal, b: Decimal): Decimal {
  const [x, y, scale] = align(a, b);
  return { units: x - y, scale };
}

/** −a */
export function negate(value: Decimal): Decimal {
  return { units: -value.units, scale: value.scale };
}

/** Tổng một danh sách; danh sách rỗng trả 0 với `scale` cho trước */
export function sum(values: readonly Decimal[], scale = MONEY_SCALE): Decimal {
  return values.reduce<Decimal>((acc, v) => add(acc, v), { units: 0n, scale });
}

/** a × b, làm tròn half-up về `scale` */
export function mul(a: Decimal, b: Decimal, scale = MONEY_SCALE): Decimal {
  assertScale(scale);
  return { units: rescaleUnits(a.units * b.units, a.scale + b.scale, scale), scale };
}

/** a ÷ b, làm tròn half-up về `scale`; b = 0 ném RangeError */
export function div(a: Decimal, b: Decimal, scale = MONEY_SCALE): Decimal {
  assertScale(scale);
  if (b.units === 0n) throw new RangeError('Chia cho 0');
  return { units: divRound(a.units * pow10(scale + b.scale), b.units * pow10(a.scale)), scale };
}

/** So sánh: −1 nếu a < b, 0 nếu bằng, 1 nếu a > b */
export function cmp(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const [x, y] = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function isZero(value: Decimal): boolean {
  return value.units === 0n;
}

export function isNegative(value: Decimal): boolean {
  return value.units < 0n;
}

/** Có phải số nguyên (không có phần lẻ khác 0) */
export function isInteger(value: Decimal): boolean {
  return value.units % pow10(value.scale) === 0n;
}

/**
 * Phân bổ `total` theo tỷ lệ `weights` (vd. chiết khấu chứng từ theo thành tiền từng dòng).
 * Mỗi dòng nhận phần làm tròn xuống; phần dư dồn vào dòng cuối có trọng số > 0, nên tổng
 * luôn bằng đúng `total` và không dòng nào âm. Kết quả cùng scale với `total`.
 * Trọng số âm ném lỗi; tổng trọng số bằng 0 chỉ hợp lệ khi `total` = 0.
 */
export function allocate(total: Decimal, weights: readonly Decimal[]): Decimal[] {
  if (isNegative(total)) throw new RangeError('Không phân bổ số âm');
  if (weights.some(isNegative)) throw new RangeError('Trọng số phân bổ không được âm');
  const zero: Decimal = { units: 0n, scale: total.scale };
  if (!weights.length) {
    if (isZero(total)) return [];
    throw new RangeError('Không có dòng để phân bổ');
  }

  const weightScale = Math.max(...weights.map((w) => w.scale));
  const units = weights.map((w) => rescaleUnits(w.units, w.scale, weightScale));
  const totalWeight = units.reduce((acc, w) => acc + w, 0n);
  if (totalWeight === 0n) {
    if (isZero(total)) return weights.map(() => zero);
    throw new RangeError('Tổng trọng số bằng 0 nhưng giá trị phân bổ khác 0');
  }

  const shares = units.map((w) => (total.units * w) / totalWeight); // BigInt chia = làm tròn xuống (số không âm)
  const remainder = total.units - shares.reduce((acc, s) => acc + s, 0n);
  let lastIndex = units.length - 1;
  while (units[lastIndex] === 0n) lastIndex -= 1;
  shares[lastIndex] = shares[lastIndex]! + remainder;
  return shares.map((s) => ({ units: s, scale: total.scale }));
}

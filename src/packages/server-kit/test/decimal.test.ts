import { describe, expect, it } from 'vitest';
import {
  add,
  allocate,
  cmp,
  COST_SCALE,
  decimal,
  decimalToString,
  div,
  isDecimalString,
  isInteger,
  mul,
  QUANTITY_SCALE,
  rescale,
  sub,
  sum,
} from '../src';

const s = decimalToString;

describe('decimal: tạo & định dạng', () => {
  it('đọc chuỗi numeric và in đủ chữ số lẻ theo scale', () => {
    expect(s(decimal('125000'))).toBe('125000.00');
    expect(s(decimal('0.5'))).toBe('0.50');
    expect(s(decimal('-12.3'))).toBe('-12.30');
    expect(s(decimal('3', QUANTITY_SCALE))).toBe('3.000');
    expect(s(decimal('7', 0))).toBe('7');
  });

  it('làm tròn half-up theo trị tuyệt đối khi có nhiều chữ số lẻ hơn scale', () => {
    expect(s(decimal('1.005'))).toBe('1.01');
    expect(s(decimal('1.004'))).toBe('1.00');
    expect(s(decimal('-1.005'))).toBe('-1.01');
    expect(s(decimal('0.0049'))).toBe('0.00');
    expect(s(rescale(decimal('23000.1250', COST_SCALE), 2))).toBe('23000.13');
  });

  it('nhận số nguyên và bigint, từ chối số thực JS', () => {
    expect(s(decimal(150))).toBe('150.00');
    expect(s(decimal(10n))).toBe('10.00');
    expect(() => decimal(0.1)).toThrow(TypeError);
  });

  it('từ chối chuỗi sai định dạng', () => {
    for (const bad of ['', 'abc', '1,5', '1.', '.5', '1e3', '--1']) {
      expect(() => decimal(bad)).toThrow(TypeError);
    }
  });

  it('giữ chính xác với số rất lớn (18 chữ số)', () => {
    const big = decimal('9999999999999999.99');
    expect(s(add(big, decimal('0.01')))).toBe('10000000000000000.00');
  });

  it('isDecimalString kiểm tra định dạng và số chữ số lẻ tối đa', () => {
    expect(isDecimalString('12.34', 2)).toBe(true);
    expect(isDecimalString('12.345', 2)).toBe(false);
    expect(isDecimalString('12,3')).toBe(false);
  });
});

describe('decimal: phép tính', () => {
  it('cộng, trừ, tổng theo scale lớn hơn', () => {
    expect(s(add(decimal('0.1'), decimal('0.2')))).toBe('0.30');
    expect(s(sub(decimal('100'), decimal('0.01')))).toBe('99.99');
    expect(s(add(decimal('1', COST_SCALE), decimal('1')))).toBe('2.0000');
    expect(s(sum([decimal('1.10'), decimal('2.20'), decimal('3.30')]))).toBe('6.60');
    expect(s(sum([]))).toBe('0.00');
  });

  it('nhân số lượng lẻ × đơn giá, làm tròn về tiền', () => {
    const qty = decimal('1.255', QUANTITY_SCALE);
    expect(s(mul(qty, decimal('10000')))).toBe('12550.00');
    expect(s(mul(decimal('0.333', QUANTITY_SCALE), decimal('0.05')))).toBe('0.02');
  });

  it('chia làm tròn half-up, chia hết và không hết', () => {
    expect(s(div(decimal('100'), decimal('4')))).toBe('25.00');
    expect(s(div(decimal('10'), decimal('3'), COST_SCALE))).toBe('3.3333');
    expect(s(div(decimal('20'), decimal('3'), COST_SCALE))).toBe('6.6667');
    expect(s(div(decimal('-1'), decimal('8')))).toBe('-0.13');
    expect(() => div(decimal('1'), decimal('0'))).toThrow(RangeError);
  });

  it('giá vốn bình quân gia quyền: (10×100k + 10×120k) / 20 = 110k', () => {
    const value = add(mul(decimal('10'), decimal('100000')), mul(decimal('10'), decimal('120000')));
    expect(s(div(value, decimal('20'), COST_SCALE))).toBe('110000.0000');
  });

  it('so sánh và kiểm tra số nguyên', () => {
    expect(cmp(decimal('1.10'), decimal('1.1', COST_SCALE))).toBe(0);
    expect(cmp(decimal('2'), decimal('10'))).toBe(-1);
    expect(cmp(decimal('-1'), decimal('-2'))).toBe(1);
    expect(isInteger(decimal('3.000', QUANTITY_SCALE))).toBe(true);
    expect(isInteger(decimal('3.5', QUANTITY_SCALE))).toBe(false);
  });
});

describe('decimal: phân bổ', () => {
  const strings = (values: ReturnType<typeof allocate>) => values.map(s);

  it('phân bổ theo tỷ lệ, tổng luôn bằng đúng giá trị gốc', () => {
    const shares = allocate(decimal('100'), [decimal('1'), decimal('1'), decimal('1')]);
    expect(strings(shares)).toEqual(['33.33', '33.33', '33.34']);
    expect(s(sum(shares))).toBe('100.00');
  });

  it('chia đều theo thành tiền khác nhau', () => {
    const shares = allocate(decimal('10000'), [decimal('30000'), decimal('70000')]);
    expect(strings(shares)).toEqual(['3000.00', '7000.00']);
  });

  it('phần dư dồn vào dòng cuối có trọng số > 0, dòng trọng số 0 nhận 0, không dòng nào âm', () => {
    const shares = allocate(decimal('0.01'), [decimal('1'), decimal('1'), decimal('0')]);
    expect(strings(shares)).toEqual(['0.00', '0.01', '0.00']);
    const many = allocate(
      decimal('1'),
      Array.from({ length: 7 }, () => decimal('3')),
    );
    expect(many.every((x) => x.units >= 0n)).toBe(true);
    expect(s(sum(many))).toBe('1.00');
  });

  it('phân bổ bằng tổng trọng số (chiết khấu = tạm tính) cho kết quả đúng từng dòng', () => {
    const weights = [decimal('12345.67'), decimal('0.33'), decimal('999')];
    expect(strings(allocate(sum(weights), weights))).toEqual(['12345.67', '0.33', '999.00']);
  });

  it('tổng trọng số 0: chỉ hợp lệ khi giá trị phân bổ bằng 0', () => {
    expect(strings(allocate(decimal('0'), [decimal('0'), decimal('0')]))).toEqual(['0.00', '0.00']);
    expect(() => allocate(decimal('1'), [decimal('0')])).toThrow(RangeError);
    expect(allocate(decimal('0'), [])).toEqual([]);
  });

  it('từ chối giá trị hoặc trọng số âm', () => {
    expect(() => allocate(decimal('-1'), [decimal('1')])).toThrow(RangeError);
    expect(() => allocate(decimal('1'), [decimal('-1'), decimal('2')])).toThrow(RangeError);
  });
});

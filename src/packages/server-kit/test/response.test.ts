import { describe, expect, it } from 'vitest';
import { AppError, conflict, createTranslator, errorBody, notFound, validationError } from '../src';

const t = createTranslator({
  vi: {
    errors: { notFound: 'Không tìm thấy', validation: 'Dữ liệu không hợp lệ', internal: 'Lỗi' },
    sales: { insufficientStock: 'Sản phẩm {{sku}} chỉ còn {{available}}' },
  },
  en: {
    errors: { notFound: 'Not found', validation: 'Invalid data', internal: 'Error' },
    sales: { insufficientStock: 'Product {{sku}} has only {{available}} left' },
  },
});

describe('errorBody: tham số lỗi', () => {
  it('lỗi có tham số trả kèm `params` và thông điệp đã dịch theo ngôn ngữ', () => {
    const error = conflict('sales.insufficientStock', { sku: 'CF01', available: '15' });
    const vi = errorBody(error, t, 'vi').body.error!;
    const en = errorBody(error, t, 'en').body.error!;
    expect(vi.params).toEqual({ sku: 'CF01', available: '15' });
    expect(vi.message).toBe('Sản phẩm CF01 chỉ còn 15');
    expect(en.message).toBe('Product CF01 has only 15 left');
    expect(en.key).toBe('sales.insufficientStock');
  });

  it('lỗi không có tham số giữ nguyên định dạng cũ (không có trường `params`)', () => {
    const { status, body } = errorBody(notFound(), t, 'vi');
    expect(status).toBe(404);
    expect(body).toEqual({
      data: null,
      error: { code: 'NOT_FOUND', key: 'errors.notFound', message: 'Không tìm thấy' },
    });
  });

  it('`params` và `details` cùng tồn tại được', () => {
    const error = new AppError(
      409,
      'CONFLICT',
      'sales.insufficientStock',
      { sku: 'A', available: 0 },
      [{ productId: 'p1', requested: '2', available: '0' }],
    );
    const body = errorBody(error, t, 'vi').body.error!;
    expect(body.params).toEqual({ sku: 'A', available: 0 });
    expect(body.details).toEqual([{ productId: 'p1', requested: '2', available: '0' }]);
  });

  it('lỗi validation không có `params`', () => {
    const body = errorBody(validationError([{ path: 'name', message: 'Required' }]), t, 'vi').body
      .error!;
    expect(body).not.toHaveProperty('params');
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

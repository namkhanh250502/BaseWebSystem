import { tooManyRequests } from './errors';

/** Trạng thái bộ đếm sau khi tăng */
export interface RateLimitCounter {
  /** Số lần đã gọi trong cửa sổ hiện tại (tính cả lần này) */
  count: number;
  /** Thời điểm cửa sổ hết hạn (ms, epoch) */
  resetAt: number;
}

/**
 * Nơi lưu bộ đếm rate limit. Bản trong bộ nhớ chỉ đúng khi chạy 1 instance;
 * nhiều instance thì dùng bản lưu chung (Redis, xem `RedisRateLimitStore` trong API).
 */
export interface RateLimitStore {
  /** Tăng bộ đếm của key (fixed window): key chưa có hoặc hết hạn thì bắt đầu cửa sổ mới */
  increment(key: string, windowMs: number): Promise<RateLimitCounter>;
  reset(key: string): Promise<void>;
}

/** Lưu bộ đếm trong bộ nhớ của process */
export function createMemoryRateLimitStore(): RateLimitStore {
  const buckets = new Map<string, RateLimitCounter>();

  function sweep(now: number) {
    if (buckets.size < 10_000) return;
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }

  return {
    async increment(key, windowMs) {
      const now = Date.now();
      sweep(now);
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + windowMs };
        buckets.set(key, fresh);
        return { ...fresh };
      }
      bucket.count += 1;
      return { ...bucket };
    },
    async reset(key) {
      buckets.delete(key);
    },
  };
}

/** Giới hạn số lần gọi theo key trong 1 khoảng thời gian (fixed window) */
export function createRateLimiter(store: RateLimitStore = createMemoryRateLimitStore()) {
  return {
    /** Tăng bộ đếm; vượt `limit` lần trong `windowMs` thì ném lỗi 429. Nhớ `await`. */
    async hit(key: string, limit: number, windowMs: number): Promise<void> {
      const { count, resetAt } = await store.increment(key, windowMs);
      if (count > limit) {
        throw tooManyRequests('errors.tooManyRequests', {
          seconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
        });
      }
    },
    reset(key: string): Promise<void> {
      return store.reset(key);
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

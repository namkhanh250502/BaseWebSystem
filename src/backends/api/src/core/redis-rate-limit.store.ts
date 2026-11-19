import Redis from 'ioredis';
import {
  createMemoryRateLimitStore,
  logger,
  type RateLimitCounter,
  type RateLimitStore,
} from '@base/server-kit';

/** Client Redis cho rate limit */
export function createRedisClient(url: string, keyPrefix: string): Redis {
  const redis = new Redis(url, {
    keyPrefix,
    // Redis mất kết nối thì lệnh báo lỗi ngay (→ dùng bộ đếm dự phòng) thay vì xếp hàng chờ;
    // ioredis vẫn tự kết nối lại ở nền
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
  });
  // Lỗi được ghi khi gọi lệnh (có giới hạn tần suất); phải có listener để không crash process
  redis.on('error', () => undefined);
  redis.on('ready', () => logger.info('Rate limit: đã kết nối Redis'));
  return redis;
}

/**
 * Bộ đếm rate limit trên Redis, dùng chung giữa nhiều instance API (fixed window).
 *
 * 1 lần gọi = 1 transaction MULTI/EXEC (nguyên tử, không lệch khi nhiều request cùng lúc):
 *   SET key 0 PX window NX  → bắt đầu cửa sổ mới nếu key chưa có (hoặc đã hết hạn)
 *   INCR key                → tăng bộ đếm, giữ nguyên thời hạn
 *   PTTL key                → thời gian còn lại của cửa sổ
 * Thời hạn do Redis quản lý nên các instance không phụ thuộc đồng hồ của nhau.
 */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'rl:',
  ) {}

  async increment(key: string, windowMs: number): Promise<RateLimitCounter> {
    const k = this.prefix + key;
    const results = await this.redis
      .multi()
      .set(k, '0', 'PX', windowMs, 'NX')
      .incr(k)
      .pttl(k)
      .exec();
    if (!results) throw new Error('Redis: transaction rate limit bị huỷ');
    for (const [error] of results) if (error) throw error;
    const count = Number(results[1]![1]);
    let ttl = Number(results[2]![1]);
    if (ttl < 0) {
      // Không có thời hạn (key bị ghi đè từ ngoài): đặt lại để key không tồn tại mãi
      await this.redis.pexpire(k, windowMs);
      ttl = windowMs;
    }
    return { count, resetAt: Date.now() + ttl };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}

/** Ghi lỗi Redis tối đa 1 lần / khoảng này để log không bị ngập khi Redis sập */
const ERROR_LOG_INTERVAL_MS = 60 * 1000;

/**
 * Store dùng Redis, lỗi thì tạm đếm trong bộ nhớ của instance này.
 * Redis sập thì đăng nhập vẫn chạy và vẫn bị giới hạn (theo từng instance) thay vì chặn hết
 * hoặc bỏ giới hạn hoàn toàn.
 */
export class RedisWithFallbackStore implements RateLimitStore {
  private readonly fallback = createMemoryRateLimitStore();
  private lastErrorLogAt = 0;

  constructor(private readonly primary: RateLimitStore) {}

  async increment(key: string, windowMs: number): Promise<RateLimitCounter> {
    try {
      return await this.primary.increment(key, windowMs);
    } catch (error) {
      this.logError(error);
      return this.fallback.increment(key, windowMs);
    }
  }

  async reset(key: string): Promise<void> {
    await this.fallback.reset(key);
    try {
      await this.primary.reset(key);
    } catch (error) {
      this.logError(error);
    }
  }

  private logError(error: unknown) {
    const now = Date.now();
    if (now - this.lastErrorLogAt < ERROR_LOG_INTERVAL_MS) return;
    this.lastErrorLogAt = now;
    logger.error('Rate limit: không gọi được Redis, tạm đếm trong bộ nhớ của instance', error);
  }
}

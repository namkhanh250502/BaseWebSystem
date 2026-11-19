import { AppError, createRateLimiter, type RateLimitStore } from '@base/server-kit';
import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createRedisClient,
  RedisRateLimitStore,
  RedisWithFallbackStore,
} from '../src/core/redis-rate-limit.store';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cùng 1 bộ test cho Redis giả (ioredis-mock, luôn chạy) và Redis thật (chỉ chạy khi đặt
 * TEST_REDIS_URL, ví dụ redis://localhost:6379/15 — test xoá key có tiền tố riêng của nó).
 */
const targets: { name: string; create: () => Redis; enabled: boolean }[] = [
  { name: 'ioredis-mock', create: () => new RedisMock() as unknown as Redis, enabled: true },
  {
    name: 'Redis thật (TEST_REDIS_URL)',
    create: () => createRedisClient(process.env.TEST_REDIS_URL!, `base-web-test:${Date.now()}:`),
    enabled: Boolean(process.env.TEST_REDIS_URL),
  },
];

for (const target of targets) {
  describe.runIf(target.enabled)(`Rate limit trên ${target.name}`, () => {
    const redis = target.create();
    const store = new RedisRateLimitStore(redis);
    const limiter = createRateLimiter(store);
    afterAll(async () => {
      await redis.quit();
    });

    it('đếm theo key, vượt limit thì 429 kèm số giây chờ; reset xoá bộ đếm', async () => {
      for (let i = 0; i < 3; i++) await limiter.hit('login:a', 3, 60_000);
      const error = await limiter.hit('login:a', 3, 60_000).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(429);
      expect((error as AppError).params).toMatchObject({ seconds: expect.any(Number) });
      expect((error as AppError).params?.seconds).toBeGreaterThan(55);

      await limiter.hit('login:b', 3, 60_000);
      await limiter.reset('login:a');
      await limiter.hit('login:a', 3, 60_000);
    });

    it('trả về số lần và thời điểm hết cửa sổ; hết cửa sổ thì đếm lại từ 1', async () => {
      const first = await store.increment('window', 150);
      const second = await store.increment('window', 150);
      expect(first.count).toBe(1);
      expect(second.count).toBe(2);
      expect(second.resetAt - Date.now()).toBeLessThanOrEqual(150);
      // Lần tăng sau không kéo dài cửa sổ
      expect(Math.abs(second.resetAt - first.resetAt)).toBeLessThan(50);
      await sleep(200);
      expect((await store.increment('window', 150)).count).toBe(1);
    });

    it('nhiều request cùng lúc: đếm đủ, không mất lượt', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => store.increment('burst', 60_000)),
      );
      expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 1),
      );
    });

    it('2 instance dùng chung 1 Redis thì dùng chung bộ đếm', async () => {
      const other = createRateLimiter(new RedisRateLimitStore(redis));
      await limiter.hit('shared', 2, 60_000);
      await other.hit('shared', 2, 60_000);
      await expect(other.hit('shared', 2, 60_000)).rejects.toBeInstanceOf(AppError);
      await expect(limiter.hit('shared', 2, 60_000)).rejects.toBeInstanceOf(AppError);
    });
  });
}

describe('Rate limit: Redis lỗi thì tạm đếm trong bộ nhớ', () => {
  it('store lỗi → vẫn giới hạn bằng bộ đếm dự phòng', async () => {
    const broken: RateLimitStore = {
      increment: () => Promise.reject(new Error('down')),
      reset: () => Promise.reject(new Error('down')),
    };
    const limiter = createRateLimiter(new RedisWithFallbackStore(broken));
    await limiter.hit('k', 2, 60_000);
    await limiter.hit('k', 2, 60_000);
    await expect(limiter.hit('k', 2, 60_000)).rejects.toBeInstanceOf(AppError);
    await limiter.reset('k');
    await limiter.hit('k', 2, 60_000);
  });

  it('Redis không kết nối được: lệnh báo lỗi ngay (không treo request)', async () => {
    // Cổng 1 không có Redis; enableOfflineQueue: false → lệnh bị từ chối ngay thay vì chờ
    const redis = createRedisClient('redis://127.0.0.1:1', 'test:');
    try {
      const limiter = createRateLimiter(new RedisWithFallbackStore(new RedisRateLimitStore(redis)));
      const started = Date.now();
      await limiter.hit('offline', 1, 60_000);
      await expect(limiter.hit('offline', 1, 60_000)).rejects.toBeInstanceOf(AppError);
      expect(Date.now() - started).toBeLessThan(1_000);
    } finally {
      redis.disconnect();
    }
  });
});

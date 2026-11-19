import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type Redis from 'ioredis';
import { createRateLimiter, type RateLimiter } from '@base/server-kit';
import { getEnv } from '../config/env';
import {
  createRedisClient,
  RedisRateLimitStore,
  RedisWithFallbackStore,
} from './redis-rate-limit.store';

export const MINUTE = 60 * 1000;

/**
 * Giới hạn số lần gọi theo key.
 * - Có REDIS_URL: bộ đếm lưu trên Redis, dùng chung giữa nhiều instance API.
 * - Không có: lưu trong bộ nhớ (chỉ đúng khi chạy 1 instance).
 */
@Injectable()
export class RateLimitService implements OnApplicationShutdown {
  private readonly redis?: Redis;
  private readonly limiter: RateLimiter;

  constructor() {
    const env = getEnv();
    if (env.REDIS_URL) {
      this.redis = createRedisClient(env.REDIS_URL, env.REDIS_KEY_PREFIX);
      this.limiter = createRateLimiter(
        new RedisWithFallbackStore(new RedisRateLimitStore(this.redis)),
      );
    } else {
      this.limiter = createRateLimiter();
    }
  }

  /** Tăng bộ đếm; vượt `limit` lần trong `windowMs` thì ném lỗi 429. Nhớ `await`. */
  hit(key: string, limit: number, windowMs: number): Promise<void> {
    return this.limiter.hit(key, limit, windowMs);
  }

  reset(key: string): Promise<void> {
    return this.limiter.reset(key);
  }

  async onApplicationShutdown() {
    if (!this.redis) return;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}

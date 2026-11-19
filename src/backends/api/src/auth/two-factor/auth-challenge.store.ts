import { Injectable } from '@nestjs/common';
import { and, authChallenges, desc, eq, gt, isNull, lt, sql, type AuthChallenge } from '@base/db';
import { logger } from '@base/server-kit';
import { InjectDb, type Database } from '../../core/database';

export type ChallengeType = 'email_otp' | 'webauthn_register' | 'webauthn_authenticate';
export type ChallengePurpose = 'login' | 'enable' | 'reauth';

const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Lưu thử thách dùng 1 lần (mã email, challenge WebAuthn) trong bảng auth_challenges.
 * Mỗi (user, type, purpose) chỉ có 1 bản ghi còn hiệu lực: tạo mới sẽ huỷ bản cũ.
 */
@Injectable()
export class AuthChallengeStore {
  private lastPurgeAt = 0;

  constructor(@InjectDb() private readonly db: Database) {}

  async create(
    userId: string,
    type: ChallengeType,
    purpose: ChallengePurpose,
    value: string,
    ttlMs: number,
  ): Promise<AuthChallenge> {
    const now = new Date();
    const row = await this.db.transaction(async (tx) => {
      await tx
        .update(authChallenges)
        .set({ consumedAt: now })
        .where(
          and(
            eq(authChallenges.userId, userId),
            eq(authChallenges.type, type),
            eq(authChallenges.purpose, purpose),
            isNull(authChallenges.consumedAt),
          ),
        );
      const [inserted] = await tx
        .insert(authChallenges)
        .values({ userId, type, purpose, value, expiresAt: new Date(now.getTime() + ttlMs) })
        .returning();
      return inserted!;
    });
    void this.purgeExpired().catch((error) => logger.warn('Không dọn được auth_challenges', error));
    return row;
  }

  /** Bản ghi còn hiệu lực mới nhất (chưa dùng, chưa hết hạn) */
  async findActive(userId: string, type: ChallengeType, purpose: ChallengePurpose) {
    const [row] = await this.db
      .select()
      .from(authChallenges)
      .where(
        and(
          eq(authChallenges.userId, userId),
          eq(authChallenges.type, type),
          eq(authChallenges.purpose, purpose),
          isNull(authChallenges.consumedAt),
          gt(authChallenges.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(authChallenges.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** Thời điểm tạo bản ghi gần nhất (kể cả đã dùng), dùng cho thời gian chờ gửi lại */
  async lastCreatedAt(userId: string, type: ChallengeType, purpose: ChallengePurpose) {
    const [row] = await this.db
      .select({ createdAt: authChallenges.createdAt })
      .from(authChallenges)
      .where(
        and(
          eq(authChallenges.userId, userId),
          eq(authChallenges.type, type),
          eq(authChallenges.purpose, purpose),
        ),
      )
      .orderBy(desc(authChallenges.createdAt))
      .limit(1);
    return row?.createdAt ?? null;
  }

  /** Đánh dấu đã dùng. Chỉ 1 request thắng nhờ điều kiện consumedAt IS NULL. */
  async consume(id: string): Promise<boolean> {
    const rows = await this.db
      .update(authChallenges)
      .set({ consumedAt: new Date() })
      .where(and(eq(authChallenges.id, id), isNull(authChallenges.consumedAt)))
      .returning({ id: authChallenges.id });
    return rows.length > 0;
  }

  /** Tăng số lần nhập sai, trả về số lần sau khi tăng */
  async recordFailure(id: string): Promise<number> {
    const [row] = await this.db
      .update(authChallenges)
      .set({ attempts: sql`${authChallenges.attempts} + 1` })
      .where(eq(authChallenges.id, id))
      .returning({ attempts: authChallenges.attempts });
    return row?.attempts ?? 0;
  }

  /** Huỷ mọi thử thách của user (khi tắt 2FA) */
  async revokeAll(userId: string): Promise<void> {
    await this.db
      .update(authChallenges)
      .set({ consumedAt: new Date() })
      .where(and(eq(authChallenges.userId, userId), isNull(authChallenges.consumedAt)));
  }

  /** Xoá bản ghi hết hạn quá 1 ngày, tối đa 1 lần/giờ */
  private async purgeExpired() {
    if (Date.now() - this.lastPurgeAt < PURGE_INTERVAL_MS) return;
    this.lastPurgeAt = Date.now();
    await this.db
      .delete(authChallenges)
      .where(lt(authChallenges.expiresAt, new Date(Date.now() - DAY_MS)));
  }
}

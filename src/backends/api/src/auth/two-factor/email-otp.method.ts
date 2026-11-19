import { randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { eq, users, type User } from '@base/db';
import {
  fullName,
  maskEmail,
  normalizeLocale,
  TWO_FACTOR_EMAIL_CODE_TTL_MINUTES,
  TWO_FACTOR_EMAIL_MAX_ATTEMPTS,
  TWO_FACTOR_EMAIL_RESEND_SECONDS,
} from '@base/shared';
import {
  badRequest,
  getClientIp,
  parseUserAgent,
  sha256,
  tooManyRequests,
  type RequestLike,
} from '@base/server-kit';
import { getEnv } from '../../config/env';
import { InjectDb, type Database } from '../../core/database';
import { MINUTE, RateLimitService } from '../../core/rate-limit.service';
import { MailService } from '../../mail/mail.service';
import { AuthChallengeStore, type ChallengePurpose } from './auth-challenge.store';

function describeDevice(req: RequestLike | undefined): string | null {
  const device = parseUserAgent(req?.headers.get('user-agent'));
  const parts = [device.browser, device.os].filter(Boolean);
  return parts.length ? parts.join(' / ') : null;
}

function hashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Mã 2FA 6 số gửi qua email: hiệu lực 10 phút, dùng 1 lần, sai 5 lần thì huỷ,
 * gửi lại sau 60 giây, tối đa 5 lần gửi / giờ.
 */
@Injectable()
export class EmailOtpMethod {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly challenges: AuthChallengeStore,
    private readonly rateLimit: RateLimitService,
    private readonly mail: MailService,
  ) {}

  /** Có thể bật email 2FA khi email đã xác minh */
  canEnable(user: User): boolean {
    return user.emailVerifiedAt !== null;
  }

  async send(
    user: User,
    purpose: ChallengePurpose,
    req?: RequestLike,
  ): Promise<{ emailHint: string; cooldownSeconds: number }> {
    const last = await this.challenges.lastCreatedAt(user.id, 'email_otp', purpose);
    if (last) {
      const elapsed = (Date.now() - last.getTime()) / 1000;
      if (elapsed < TWO_FACTOR_EMAIL_RESEND_SECONDS) {
        throw tooManyRequests('twoFactor.emailCooldown', {
          seconds: Math.ceil(TWO_FACTOR_EMAIL_RESEND_SECONDS - elapsed),
        });
      }
    }
    await this.rateLimit.hit(`2fa-email-send:${user.id}`, 5, 60 * MINUTE);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const locale = normalizeLocale(user.lang);
    const sent = await this.mail.sendTwoFactorCode({
      to: user.email,
      name: fullName(user, locale) || user.email,
      code,
      locale,
      expiresInMinutes: TWO_FACTOR_EMAIL_CODE_TTL_MINUTES,
      ipAddress: req ? getClientIp(req) : null,
      device: describeDevice(req),
    });
    // Production: không gửi được thì báo lỗi. Dev: nội dung email (kèm mã) đã được ghi ra log.
    if (!sent && getEnv().NODE_ENV === 'production') throw badRequest('twoFactor.emailSendFailed');

    await this.challenges.create(
      user.id,
      'email_otp',
      purpose,
      sha256(code),
      TWO_FACTOR_EMAIL_CODE_TTL_MINUTES * MINUTE,
    );
    return { emailHint: maskEmail(user.email), cooldownSeconds: TWO_FACTOR_EMAIL_RESEND_SECONDS };
  }

  async verify(user: User, code: string, purpose: ChallengePurpose): Promise<boolean> {
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) return false;
    const challenge = await this.challenges.findActive(user.id, 'email_otp', purpose);
    if (!challenge) return false;
    if (challenge.attempts >= TWO_FACTOR_EMAIL_MAX_ATTEMPTS) {
      await this.challenges.consume(challenge.id);
      return false;
    }
    if (!hashEquals(challenge.value, sha256(trimmed))) {
      const attempts = await this.challenges.recordFailure(challenge.id);
      if (attempts >= TWO_FACTOR_EMAIL_MAX_ATTEMPTS) await this.challenges.consume(challenge.id);
      return false;
    }
    return this.challenges.consume(challenge.id);
  }

  async enable(userId: string): Promise<void> {
    await this.db.update(users).set({ twoFactorEmailEnabled: true }).where(eq(users.id, userId));
  }

  async disable(userId: string): Promise<void> {
    await this.db.update(users).set({ twoFactorEmailEnabled: false }).where(eq(users.id, userId));
  }
}

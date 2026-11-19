import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { eq, users, type User } from '@base/db';
import {
  EMAIL_VERIFICATION_CODE_TTL_MINUTES,
  EMAIL_VERIFICATION_RESEND_SECONDS,
  fullName,
  normalizeLocale,
} from '@base/shared';
import { badRequest, sha256, tooManyRequests } from '@base/server-kit';
import { getEnv } from '../config/env';
import { InjectDb, type Database } from '../core/database';
import { MINUTE, RateLimitService } from '../core/rate-limit.service';
import { MailService } from '../mail/mail.service';

/** Xác minh email bằng mã 6 số gửi qua Sendify (hoặc SMTP), hiệu lực 10 phút, gửi lại sau 60 giây */
@Injectable()
export class EmailVerificationService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly rateLimit: RateLimitService,
    private readonly mail: MailService,
  ) {}

  async sendCode(user: User): Promise<{ cooldownSeconds: number }> {
    if (user.emailVerifiedAt) throw badRequest('emailVerification.alreadyVerified');

    if (user.emailVerificationSentAt) {
      const elapsed = (Date.now() - user.emailVerificationSentAt.getTime()) / 1000;
      if (elapsed < EMAIL_VERIFICATION_RESEND_SECONDS) {
        throw tooManyRequests('emailVerification.cooldown', {
          seconds: Math.ceil(EMAIL_VERIFICATION_RESEND_SECONDS - elapsed),
        });
      }
    }
    await this.rateLimit.hit(`verify-email-send:${user.id}`, 10, 60 * MINUTE);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const locale = normalizeLocale(user.lang);
    const sent = await this.mail.sendVerificationCode({
      to: user.email,
      name: fullName(user, locale) || user.email,
      code,
      locale,
      expiresInMinutes: EMAIL_VERIFICATION_CODE_TTL_MINUTES,
    });
    // Production: không gửi được thì báo lỗi để user thử lại.
    // Dev: chưa cấu hình Sendify/SMTP thì nội dung email (kèm mã) đã được ghi ra log.
    if (!sent && getEnv().NODE_ENV === 'production') {
      throw badRequest('emailVerification.sendFailed');
    }

    const now = new Date();
    await this.db
      .update(users)
      .set({
        emailVerificationCodeHash: sha256(code),
        emailVerificationExpiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_CODE_TTL_MINUTES * MINUTE),
        emailVerificationSentAt: now,
      })
      .where(eq(users.id, user.id));
    return { cooldownSeconds: EMAIL_VERIFICATION_RESEND_SECONDS };
  }

  async verify(user: User, code: string): Promise<void> {
    if (user.emailVerifiedAt) throw badRequest('emailVerification.alreadyVerified');
    await this.rateLimit.hit(`verify-email:${user.id}`, 10, 10 * MINUTE);

    const valid =
      user.emailVerificationCodeHash !== null &&
      user.emailVerificationExpiresAt !== null &&
      user.emailVerificationExpiresAt > new Date() &&
      user.emailVerificationCodeHash === sha256(code);
    if (!valid) throw badRequest('emailVerification.codeInvalid');

    await this.db
      .update(users)
      .set({
        emailVerifiedAt: new Date(),
        emailVerificationCodeHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationSentAt: null,
      })
      .where(eq(users.id, user.id));
    await this.rateLimit.reset(`verify-email:${user.id}`);
  }
}

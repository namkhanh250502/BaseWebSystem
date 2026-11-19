import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lt, or, users, type User } from '@base/db';
import type { TwoFactorSetupDto } from '@base/shared';
import {
  buildOtpauthUrl,
  decrypt,
  encrypt,
  generateTotpSecret,
  matchTotp,
  toQrDataUrl,
} from '@base/server-kit';
import { getEnv } from '../../config/env';
import { InjectDb, type Database } from '../../core/database';

/** TOTP (Google Authenticator, Authy…): secret mã hoá AES-256-GCM bằng ENCRYPTION_KEY */
@Injectable()
export class TotpMethod {
  constructor(@InjectDb() private readonly db: Database) {}

  /** Tạo secret mới (chưa bật) và trả về QR để quét bằng ứng dụng Authenticator */
  async startSetup(user: User): Promise<TwoFactorSetupDto> {
    const secret = generateTotpSecret();
    await this.db
      .update(users)
      .set({
        twoFactorSecret: encrypt(secret, getEnv().ENCRYPTION_KEY),
        twoFactorTotpLastStep: null,
      })
      .where(eq(users.id, user.id));
    const otpauthUrl = buildOtpauthUrl({ issuer: getEnv().APP_NAME, label: user.email, secret });
    return { secret, otpauthUrl, qrCode: await toQrDataUrl(otpauthUrl) };
  }

  /**
   * Kiểm tra mã với secret hiện tại (kể cả khi đang thiết lập dở). Mỗi mã chỉ dùng được 1 lần:
   * ghi bước thời gian của mã vào DB bằng 1 câu UPDATE có điều kiện `last_step < step`, nên mã đã
   * dùng (hoặc mã cũ hơn mã đã dùng) bị từ chối, kể cả khi 2 request gửi cùng lúc.
   */
  async verify(user: User, code: string): Promise<boolean> {
    if (!user.twoFactorSecret) return false;
    let secret: string;
    try {
      secret = decrypt(user.twoFactorSecret, getEnv().ENCRYPTION_KEY);
    } catch {
      return false;
    }
    const step = await matchTotp(secret, code.trim());
    if (step === null) return false;
    const updated = await this.db
      .update(users)
      .set({ twoFactorTotpLastStep: step })
      .where(
        and(
          eq(users.id, user.id),
          // Secret phải còn là secret vừa kiểm tra (không bị thiết lập lại giữa chừng)
          eq(users.twoFactorSecret, user.twoFactorSecret),
          or(isNull(users.twoFactorTotpLastStep), lt(users.twoFactorTotpLastStep, step)),
        ),
      )
      .returning({ id: users.id });
    return updated.length > 0;
  }

  async enable(userId: string): Promise<void> {
    await this.db.update(users).set({ twoFactorTotpEnabled: true }).where(eq(users.id, userId));
  }

  async disable(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ twoFactorTotpEnabled: false, twoFactorSecret: null, twoFactorTotpLastStep: null })
      .where(eq(users.id, userId));
  }
}

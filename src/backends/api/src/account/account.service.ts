import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { eq, users, type User } from '@base/db';
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  type ChangePasswordInput,
  type DisableTwoFactorInput,
  type UpdateProfileInput,
} from '@base/shared';
import { badRequest, hashPassword, payloadTooLarge, verifyPassword } from '@base/server-kit';
import type { Principal } from '../auth/principal';
import { SessionService } from '../auth/session.service';
import { TwoFactorService } from '../auth/two-factor/two-factor.service';
import { InjectDb, type Database } from '../core/database';
import { MINUTE, RateLimitService } from '../core/rate-limit.service';
import { avatarDir, AVATAR_URL_PREFIX } from '../files/avatar-storage';
import { NotificationsService } from '../notifications/notifications.service';

const EXTENSIONS: Record<(typeof AVATAR_MIME_TYPES)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** File upload tối thiểu cần dùng (multer, lưu trong bộ nhớ) */
export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

/** Kiểm tra "magic bytes" để chắc chắn file thực sự là ảnh, không chỉ tin vào Content-Type */
function sniffImage(bytes: Uint8Array): (typeof AVATAR_MIME_TYPES)[number] | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

async function removeAvatarFile(url: string | null) {
  if (!url?.startsWith(AVATAR_URL_PREFIX)) return;
  const name = path.basename(url.slice(AVATAR_URL_PREFIX.length));
  await unlink(path.join(avatarDir(), name)).catch(() => undefined);
}

/** Nghiệp vụ tài khoản của chính user đang đăng nhập */
@Injectable()
export class AccountService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly rateLimit: RateLimitService,
    private readonly sessions: SessionService,
    private readonly twoFactor: TwoFactorService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Kiểm tra mật khẩu hiện tại; tài khoản chưa có mật khẩu (tạo qua Google) thì bỏ qua */
  private async verifyPasswordOrThrow(user: User, password: string | undefined) {
    if (!user.passwordHash) return;
    await this.rateLimit.hit(`password-check:${user.id}`, 10, 15 * MINUTE);
    if (!password || !(await verifyPassword(password, user.passwordHash))) {
      throw badRequest('account.passwordIncorrect');
    }
  }

  async updateProfile(user: User, input: UpdateProfileInput) {
    if (!Object.keys(input).length) return;
    await this.db.update(users).set(input).where(eq(users.id, user.id));
  }

  async uploadAvatar(user: User, file: UploadedImage | undefined) {
    if (!file) throw badRequest('account.avatarRequired');
    if (file.size > AVATAR_MAX_BYTES) {
      throw payloadTooLarge('account.avatarTooLarge', {
        size: `${AVATAR_MAX_BYTES / 1024 / 1024}MB`,
      });
    }
    const bytes = new Uint8Array(file.buffer);
    const type = sniffImage(bytes);
    if (!type) throw badRequest('account.avatarInvalidType');

    const name = `${randomUUID()}.${EXTENSIONS[type]}`;
    await mkdir(avatarDir(), { recursive: true });
    await writeFile(path.join(avatarDir(), name), bytes);

    await this.db
      .update(users)
      .set({ avatarUrl: `${AVATAR_URL_PREFIX}${name}` })
      .where(eq(users.id, user.id));
    await removeAvatarFile(user.avatarUrl);
  }

  async removeAvatar(user: User) {
    await this.db.update(users).set({ avatarUrl: null }).where(eq(users.id, user.id));
    await removeAvatarFile(user.avatarUrl);
  }

  /** Đổi mật khẩu và đăng xuất mọi thiết bị khác (giữ phiên hiện tại) */
  async changePassword(user: User, input: ChangePasswordInput, currentRefreshToken: string | null) {
    // Tài khoản tạo qua Google chưa có mật khẩu: được đặt mật khẩu lần đầu không cần mật khẩu cũ
    if (user.passwordHash) {
      await this.rateLimit.hit(`password-check:${user.id}`, 10, 15 * MINUTE);
      const current = input.currentPassword ?? '';
      if (!current || !(await verifyPassword(current, user.passwordHash))) {
        throw badRequest('account.currentPasswordIncorrect');
      }
      if (current === input.newPassword) throw badRequest('account.samePassword');
    }

    await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.newPassword) })
      .where(eq(users.id, user.id));
    await this.sessions.revokeAll(user.id, currentRefreshToken);
    await this.notifications.notifyUser(user, 'passwordChanged', { type: 'warning' });
  }

  /** Tắt toàn bộ 2FA (đã qua ReauthGuard): kiểm tra mật khẩu, xoá mọi phương thức, đăng xuất thiết bị khác */
  async disableTwoFactor(
    principal: Principal,
    input: DisableTwoFactorInput,
    currentRefreshToken: string | null,
  ) {
    await this.verifyPasswordOrThrow(principal.user, input.password);
    await this.twoFactor.disableAllFor(principal);
    await this.sessions.revokeAll(principal.user.id, currentRefreshToken);
  }
}

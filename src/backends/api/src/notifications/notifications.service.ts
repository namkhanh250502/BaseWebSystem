import { Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  notificationReads,
  notifications,
  or,
  sql,
  users,
  type NewNotification,
} from '@base/db';
import {
  normalizeLocale,
  type NotificationDto,
  type NotificationType,
  type SendNotificationInput,
} from '@base/shared';
import { notFound, type TranslateParams } from '@base/server-kit';
import { InjectDb, type Database } from '../core/database';
import { t } from '../i18n';

/** Thông báo user nhìn thấy: của chính họ hoặc thông báo toàn hệ thống */
const visibleTo = (userId: string) =>
  or(eq(notifications.userId, userId), eq(notifications.isGlobal, true));

@Injectable()
export class NotificationsService {
  constructor(@InjectDb() private readonly db: Database) {}

  async list(
    userId: string,
    { page, pageSize, unreadOnly }: { page: number; pageSize: number; unreadOnly: boolean },
  ) {
    const where = and(visibleTo(userId), unreadOnly ? isNull(notificationReads.readAt) : undefined);
    const readJoin = and(
      eq(notificationReads.notificationId, notifications.id),
      eq(notificationReads.userId, userId),
    );

    const [rows, [total]] = await Promise.all([
      this.db
        .select({ notification: notifications, readAt: notificationReads.readAt })
        .from(notifications)
        .leftJoin(notificationReads, readJoin)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(notifications)
        .leftJoin(notificationReads, readJoin)
        .where(where),
    ]);

    const items: NotificationDto[] = rows.map(({ notification: n, readAt }) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      link: n.link,
      isGlobal: n.isGlobal,
      read: readAt !== null,
      createdAt: n.createdAt.toISOString(),
    }));
    return { items, meta: { page, pageSize, total: total?.value ?? 0 } };
  }

  async unreadCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(notifications)
      .leftJoin(
        notificationReads,
        and(
          eq(notificationReads.notificationId, notifications.id),
          eq(notificationReads.userId, userId),
        ),
      )
      .where(and(visibleTo(userId), isNull(notificationReads.readAt)));
    return row?.value ?? 0;
  }

  /** Đánh dấu đã đọc; chỉ áp dụng cho thông báo user được phép thấy */
  async markRead(userId: string, ids: string[]): Promise<void> {
    const visible = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(inArray(notifications.id, ids), visibleTo(userId)));
    if (!visible.length) return;
    await this.db
      .insert(notificationReads)
      .values(visible.map((n) => ({ notificationId: n.id, userId })))
      .onConflictDoNothing();
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db.execute(sql`
      insert into ${notificationReads} (notification_id, user_id)
      select ${notifications.id}, ${userId}::uuid from ${notifications}
      where (${notifications.userId} = ${userId}::uuid or ${notifications.isGlobal} = true)
      on conflict do nothing`);
  }

  async send(input: Omit<NewNotification, 'id' | 'createdAt'>) {
    const [row] = await this.db.insert(notifications).values(input).returning();
    return row!;
  }

  /** Admin gửi thông báo */
  async sendFromAdmin(input: SendNotificationInput & { type: NotificationType; isGlobal: boolean }) {
    if (!input.isGlobal && input.userId) {
      const [user] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userId));
      if (!user) throw notFound('users.notFound');
    }
    return this.send({
      userId: input.isGlobal ? null : (input.userId ?? null),
      isGlobal: input.isGlobal,
      type: input.type,
      title: input.title,
      message: input.message ?? '',
      link: input.link ?? null,
    });
  }

  /**
   * Thông báo hệ thống cho 1 user, nội dung dịch theo ngôn ngữ của user tại thời điểm gửi.
   * `key` trỏ tới `notifications.<key>.title|message` trong i18n.
   */
  async notifyUser(
    user: { id: string; lang: string },
    key: string,
    options: { type?: NotificationType; params?: TranslateParams; link?: string } = {},
  ) {
    const locale = normalizeLocale(user.lang);
    return this.send({
      userId: user.id,
      isGlobal: false,
      type: options.type ?? 'info',
      title: t(locale, `notifications.${key}.title`, options.params),
      message: t(locale, `notifications.${key}.message`, options.params),
      link: options.link ?? null,
    });
  }
}

import { z } from 'zod';
import { paginationQuerySchema } from './common';

export const NOTIFICATION_TYPES = ['info', 'success', 'warning', 'error'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export const markNotificationsReadSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
});

/** Admin gửi thông báo: cho 1 user (userId) hoặc toàn hệ thống (isGlobal) */
export const sendNotificationSchema = z
  .object({
    userId: z.uuid().nullable().optional(),
    isGlobal: z.boolean().default(false),
    type: z.enum(NOTIFICATION_TYPES).default('info'),
    title: z.string().trim().min(1).max(255),
    message: z.string().trim().max(5000).default(''),
    link: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.isGlobal || Boolean(v.userId), {
    message: 'notification.targetRequired',
    path: ['userId'],
  });

export type SendNotificationInput = z.input<typeof sendNotificationSchema>;

export interface ListNotificationsQuery {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  isGlobal: boolean;
  read: boolean;
  createdAt: string;
}

export interface UnreadCountDto {
  count: number;
}

import { Controller, Post } from '@nestjs/common';
import { sendNotificationSchema } from '@base/shared';
import type { z } from 'zod';
import { RequirePermission, ZodBody } from '../decorators/customize';
import { NotificationsService } from './notifications.service';

/** API admin gửi thông báo. API đọc thông báo của user nằm ở account.controller (/me/notifications). */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @RequirePermission('notifications.send')
  @Post()
  async send(@ZodBody(sendNotificationSchema) input: z.infer<typeof sendNotificationSchema>) {
    const row = await this.notificationsService.sendFromAdmin(input);
    return { id: row.id };
  }
}

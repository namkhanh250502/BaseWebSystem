import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AVATAR_MAX_BYTES,
  changePasswordSchema,
  listLoginHistoryQuerySchema,
  listNotificationsQuerySchema,
  markNotificationsReadSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '@base/shared';
import type { z } from 'zod';
import { PrincipalService, type Principal } from '../auth/principal';
import { SessionService } from '../auth/session.service';
import type { RequestContext } from '../core/request-context';
import { paginated } from '../core/transform.interceptor';
import {
  AllowUnverifiedEmail,
  CurrentPrincipal,
  ReqCtx,
  ZodBody,
  ZodQuery,
} from '../decorators/customize';
import { EmailVerificationService } from '../email-verification/email-verification.service';
import { LoginHistoryService } from '../login-history/login-history.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toMeDto } from '../users/user.mapper';
import { AccountService, type UploadedImage } from './account.service';
import { AvatarUploadErrorInterceptor } from './avatar-upload.interceptor';

/** API cho user đang đăng nhập: /api/v1/me/* */
@Controller('me')
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly emailVerification: EmailVerificationService,
    private readonly loginHistory: LoginHistoryService,
    private readonly notifications: NotificationsService,
    private readonly principals: PrincipalService,
    private readonly sessions: SessionService,
  ) {}

  /** Trả về thông tin user mới nhất sau khi thay đổi */
  private async freshMe(userId: string) {
    return toMeDto((await this.principals.load(userId))!);
  }

  // ----- Các API tài khoản: vẫn gọi được khi bắt buộc xác minh email mà user chưa xác minh -----

  @AllowUnverifiedEmail()
  @HttpCode(HttpStatus.OK)
  @Post('email-verification/send')
  sendVerificationEmail(@CurrentPrincipal() principal: Principal) {
    return this.emailVerification.sendCode(principal.user);
  }

  @AllowUnverifiedEmail()
  @HttpCode(HttpStatus.OK)
  @Post('email-verification/verify')
  async verifyEmail(
    @ZodBody(verifyEmailSchema) { code }: z.infer<typeof verifyEmailSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    await this.emailVerification.verify(principal.user, code);
    return this.freshMe(principal.user.id);
  }

  @AllowUnverifiedEmail()
  @Patch()
  async updateProfile(
    @ZodBody(updateProfileSchema) input: z.infer<typeof updateProfileSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    await this.accountService.updateProfile(principal.user, input);
    return this.freshMe(principal.user.id);
  }

  @AllowUnverifiedEmail()
  @HttpCode(HttpStatus.OK)
  @Post('avatar')
  @UseInterceptors(
    AvatarUploadErrorInterceptor,
    FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }),
  )
  async uploadAvatar(
    @UploadedFile() file: UploadedImage | undefined,
    @CurrentPrincipal() principal: Principal,
  ) {
    await this.accountService.uploadAvatar(principal.user, file);
    return this.freshMe(principal.user.id);
  }

  @AllowUnverifiedEmail()
  @Delete('avatar')
  async removeAvatar(@CurrentPrincipal() principal: Principal) {
    await this.accountService.removeAvatar(principal.user);
    return this.freshMe(principal.user.id);
  }

  @AllowUnverifiedEmail()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('change-password')
  async changePassword(
    @ZodBody(changePasswordSchema) input: z.infer<typeof changePasswordSchema>,
    @CurrentPrincipal() principal: Principal,
    @ReqCtx() { req, app }: RequestContext,
  ) {
    await this.accountService.changePassword(
      principal.user,
      input,
      this.sessions.readRefreshToken(req, app),
    );
  }

  // ----- Lịch sử đăng nhập, thông báo -----

  @Get('login-history')
  async loginHistoryList(
    @ZodQuery(listLoginHistoryQuerySchema) query: z.infer<typeof listLoginHistoryQuerySchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return paginated(await this.loginHistory.list(principal.user.id, query));
  }

  @Get('notifications')
  async notificationList(
    @ZodQuery(listNotificationsQuerySchema) query: z.infer<typeof listNotificationsQuerySchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return paginated(await this.notifications.list(principal.user.id, query));
  }

  @Get('notifications/unread-count')
  async unreadCount(@CurrentPrincipal() principal: Principal) {
    return { count: await this.notifications.unreadCount(principal.user.id) };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('notifications/read')
  async markNotificationsRead(
    @ZodBody(markNotificationsReadSchema) { ids }: z.infer<typeof markNotificationsReadSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    await this.notifications.markRead(principal.user.id, ids);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('notifications/read-all')
  async markAllNotificationsRead(@CurrentPrincipal() principal: Principal) {
    await this.notifications.markAllRead(principal.user.id);
  }
}

import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Put } from '@nestjs/common';
import {
  addPasskeySchema,
  defaultTwoFactorMethodSchema,
  disableTwoFactorSchema,
  enableTwoFactorSchema,
  idParamSchema,
  reauthPrepareSchema,
  reauthSchema,
  renamePasskeySchema,
} from '@base/shared';
import type { z } from 'zod';
import type { Principal } from '../auth/principal';
import { SessionService } from '../auth/session.service';
import { RequireReauth } from '../auth/two-factor/reauth.guard';
import { TwoFactorService } from '../auth/two-factor/two-factor.service';
import type { RequestContext } from '../core/request-context';
import { CurrentPrincipal, ReqCtx, ZodBody, ZodParams } from '../decorators/customize';
import { AccountService } from './account.service';

/**
 * Quản lý xác thực 2 lớp của chính mình: /api/v1/me/2fa/*
 * Route có @RequireReauth() cần header x-reauth-token (lấy từ POST /me/2fa/reauth) khi 2FA đang bật.
 */
@Controller('me/2fa')
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly accountService: AccountService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  status(@CurrentPrincipal() principal: Principal) {
    return this.twoFactor.status(principal);
  }

  // ----- Xác minh lại (step-up) -----

  /** Chuẩn bị xác minh: email → gửi mã, passkey → options cho trình duyệt */
  @HttpCode(HttpStatus.OK)
  @Post('reauth/prepare')
  prepareReauth(
    @ZodBody(reauthPrepareSchema) { method }: z.infer<typeof reauthPrepareSchema>,
    @CurrentPrincipal() principal: Principal,
    @ReqCtx() { req }: RequestContext,
  ) {
    return this.twoFactor.prepare(principal.user, method, 'reauth', req);
  }

  /** Xác minh lại bằng 1 phương thức đang bật (hoặc mã dự phòng) → token 5 phút */
  @HttpCode(HttpStatus.OK)
  @Post('reauth')
  async reauth(
    @ZodBody(reauthSchema) input: z.infer<typeof reauthSchema>,
    @CurrentPrincipal() principal: Principal,
    @ReqCtx() { app }: RequestContext,
  ) {
    await this.twoFactor.verify(principal.user, input, 'reauth');
    return this.twoFactor.issueReauthToken(principal.user.id, app);
  }

  // ----- TOTP -----

  @RequireReauth()
  @HttpCode(HttpStatus.OK)
  @Post('totp/setup')
  totpSetup(@CurrentPrincipal() principal: Principal) {
    return this.twoFactor.startTotpSetup(principal.user);
  }

  @RequireReauth()
  @HttpCode(HttpStatus.OK)
  @Post('totp/enable')
  totpEnable(
    @ZodBody(enableTwoFactorSchema) { code }: z.infer<typeof enableTwoFactorSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.twoFactor.enableTotp(principal.user, code);
  }

  @RequireReauth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('totp')
  async totpDisable(@CurrentPrincipal() principal: Principal) {
    await this.twoFactor.disableTotp(principal);
  }

  // ----- Email -----

  @RequireReauth()
  @HttpCode(HttpStatus.OK)
  @Post('email/send')
  emailSend(@CurrentPrincipal() principal: Principal, @ReqCtx() { req }: RequestContext) {
    return this.twoFactor.sendEmailEnableCode(principal.user, req);
  }

  @RequireReauth()
  @HttpCode(HttpStatus.OK)
  @Post('email/enable')
  emailEnable(
    @ZodBody(enableTwoFactorSchema) { code }: z.infer<typeof enableTwoFactorSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.twoFactor.enableEmail(principal.user, code);
  }

  @RequireReauth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('email')
  async emailDisable(@CurrentPrincipal() principal: Principal) {
    await this.twoFactor.disableEmail(principal);
  }

  // ----- Passkey -----

  @RequireReauth()
  @HttpCode(HttpStatus.OK)
  @Post('passkeys/options')
  passkeyOptions(@CurrentPrincipal() principal: Principal) {
    return this.twoFactor.passkeyRegistrationOptions(principal.user);
  }

  @RequireReauth()
  @HttpCode(HttpStatus.OK)
  @Post('passkeys')
  passkeyAdd(
    @ZodBody(addPasskeySchema) { name, response }: z.infer<typeof addPasskeySchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.twoFactor.addPasskey(principal.user, name, response);
  }

  @Patch('passkeys/:id')
  passkeyRename(
    @ZodParams(idParamSchema) { id }: z.infer<typeof idParamSchema>,
    @ZodBody(renamePasskeySchema) { name }: z.infer<typeof renamePasskeySchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.twoFactor.renamePasskey(principal.user.id, id, name);
  }

  @RequireReauth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('passkeys/:id')
  async passkeyRemove(
    @ZodParams(idParamSchema) { id }: z.infer<typeof idParamSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    await this.twoFactor.removePasskey(principal, id);
  }

  // ----- Chung -----

  @HttpCode(HttpStatus.NO_CONTENT)
  @Put('default-method')
  async setDefault(
    @ZodBody(defaultTwoFactorMethodSchema) { method }: z.infer<typeof defaultTwoFactorMethodSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    await this.twoFactor.setDefaultMethod(principal.user, method);
  }

  @RequireReauth()
  @HttpCode(HttpStatus.OK)
  @Post('backup-codes')
  async regenerateBackupCodes(@CurrentPrincipal() principal: Principal) {
    return { backupCodes: await this.twoFactor.regenerateBackupCodesFor(principal.user) };
  }

  /** Tắt toàn bộ 2FA: cần xác minh lại + mật khẩu; đăng xuất các thiết bị khác */
  @RequireReauth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('disable')
  async disable(
    @ZodBody(disableTwoFactorSchema) input: z.infer<typeof disableTwoFactorSchema>,
    @CurrentPrincipal() principal: Principal,
    @ReqCtx() { req, app }: RequestContext,
  ) {
    await this.accountService.disableTwoFactor(
      principal,
      input,
      this.sessions.readRefreshToken(req, app),
    );
  }
}

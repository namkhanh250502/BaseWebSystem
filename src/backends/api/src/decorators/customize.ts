/* ---------------------------------------------------------
 * Custom decorators
 * @Public()                 : không cần đăng nhập
 * @RequirePermission(...)   : cần ít nhất 1 trong các quyền (super admin luôn qua)
 * @AllowUnverifiedEmail()   : vẫn gọi được khi bắt buộc xác minh email mà user chưa xác minh
 * @CurrentPrincipal()       : user đang đăng nhập (kèm role, quyền)
 * @ReqCtx()                 : header, app (x-app), ngôn ngữ của request
 * @ZodBody / @ZodQuery / @ZodParams(schema) : validate bằng schema zod của @base/shared
 * ---------------------------------------------------------*/
import {
  Body,
  createParamDecorator,
  Param,
  Query,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { PermissionKey } from '@base/shared';
import { unauthorized } from '@base/server-kit';
import type { z } from 'zod';
import { getPrincipal, getRequestContext } from '../core/request-context';
import { ZodValidationPipe } from '../core/zod-validation.pipe';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermission = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const ALLOW_UNVERIFIED_EMAIL_KEY = 'allowUnverifiedEmail';
export const AllowUnverifiedEmail = () => SetMetadata(ALLOW_UNVERIFIED_EMAIL_KEY, true);

export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const principal = getPrincipal(ctx.switchToHttp().getRequest<Request>());
  // Chỉ xảy ra khi dùng nhầm trên route @Public()
  if (!principal) throw unauthorized();
  return principal;
});

export const ReqCtx = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  getRequestContext(ctx.switchToHttp().getRequest<Request>()),
);

export const ZodBody = <S extends z.ZodType>(schema: S) => Body(new ZodValidationPipe(schema));
export const ZodQuery = <S extends z.ZodType>(schema: S) => Query(new ZodValidationPipe(schema));
export const ZodParams = <S extends z.ZodType>(schema: S) => Param(new ZodValidationPipe(schema));

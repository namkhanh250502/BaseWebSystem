import { Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  createUserSchema,
  idParamSchema,
  listLoginHistoryQuerySchema,
  listUsersQuerySchema,
  updateUserSchema,
  userAnalyticsQuerySchema,
  type IdParam,
} from '@base/shared';
import type { z } from 'zod';
import type { Principal } from '../auth/principal';
import { paginated } from '../core/transform.interceptor';
import {
  CurrentPrincipal,
  RequirePermission,
  ZodBody,
  ZodParams,
  ZodQuery,
} from '../decorators/customize';
import { LoginHistoryService } from '../login-history/login-history.service';
import { UsersAnalyticsService } from './users-analytics.service';
import { UsersService } from './users.service';

/** Controller: đọc request, validate, gọi service. Không chứa logic nghiệp vụ. */
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly loginHistory: LoginHistoryService,
    private readonly analytics: UsersAnalyticsService,
  ) {}

  @RequirePermission('users.list')
  @Get()
  async list(@ZodQuery(listUsersQuerySchema) query: z.infer<typeof listUsersQuerySchema>) {
    return paginated(await this.usersService.list(query));
  }

  @RequirePermission('users.create')
  @Post()
  create(
    @ZodBody(createUserSchema) input: z.infer<typeof createUserSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.usersService.create(principal, input);
  }

  // Khai báo trước `GET :id`, nếu không "analytics" sẽ bị khớp như một id
  @RequirePermission('users.analytics')
  @Get('analytics')
  growth(@ZodQuery(userAnalyticsQuerySchema) query: z.infer<typeof userAnalyticsQuerySchema>) {
    return this.analytics.growth(query);
  }

  @RequirePermission('users.view')
  @Get(':id')
  get(@ZodParams(idParamSchema) { id }: IdParam) {
    return this.usersService.getById(id);
  }

  @RequirePermission('users.update')
  @Patch(':id')
  update(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(updateUserSchema) input: z.infer<typeof updateUserSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.usersService.update(principal, id, input);
  }

  @RequirePermission('users.resetPassword')
  @HttpCode(HttpStatus.OK)
  @Post(':id/reset-password')
  resetPassword(
    @ZodParams(idParamSchema) { id }: IdParam,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.usersService.resetPassword(principal, id);
  }

  @RequirePermission('users.disableTwoFactor')
  @HttpCode(HttpStatus.OK)
  @Post(':id/disable-2fa')
  disableTwoFactor(
    @ZodParams(idParamSchema) { id }: IdParam,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.usersService.disableTwoFactor(principal, id);
  }

  @RequirePermission('users.loginHistory')
  @Get(':id/login-history')
  async loginHistoryList(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodQuery(listLoginHistoryQuerySchema) query: z.infer<typeof listLoginHistoryQuerySchema>,
  ) {
    await this.usersService.getById(id); // 404 nếu user không tồn tại
    return paginated(await this.loginHistory.list(id, query));
  }
}

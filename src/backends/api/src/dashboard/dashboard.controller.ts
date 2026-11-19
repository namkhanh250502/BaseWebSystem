import { Controller, Get } from '@nestjs/common';
import { salesSummaryDtoSchema, userGrowthQuerySchema } from '@base/shared';
import type { z } from 'zod';
import type { Principal } from '../auth/principal';
import { ApiZodResponse } from '../decorators/api-docs';
import { CurrentPrincipal, RequirePermission, ZodQuery } from '../decorators/customize';
import { ReportsQueryService } from '../reports/reports-query.service';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly reports: ReportsQueryService,
  ) {}

  @RequirePermission('dashboard.userGrowth')
  @Get('user-growth')
  userGrowth(@ZodQuery(userGrowthQuerySchema) query: z.infer<typeof userGrowthQuerySchema>) {
    return this.dashboardService.userGrowth(query.year ?? new Date().getFullYear());
  }

  /** Tổng quan bán hàng & tồn kho (FR-030); giá trị tồn chỉ khi có inventory.viewValue */
  @RequirePermission('dashboard.salesSummary')
  @ApiZodResponse(salesSummaryDtoSchema)
  @Get('sales-summary')
  salesSummary(@CurrentPrincipal() principal: Principal) {
    return this.reports.salesSummary({ canViewValue: principal.can('inventory.viewValue') });
  }
}

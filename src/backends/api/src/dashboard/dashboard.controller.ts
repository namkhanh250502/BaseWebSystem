import { Controller, Get } from '@nestjs/common';
import { userGrowthQuerySchema } from '@base/shared';
import type { z } from 'zod';
import { RequirePermission, ZodQuery } from '../decorators/customize';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @RequirePermission('dashboard.userGrowth')
  @Get('user-growth')
  userGrowth(@ZodQuery(userGrowthQuerySchema) query: z.infer<typeof userGrowthQuerySchema>) {
    return this.dashboardService.userGrowth(query.year ?? new Date().getFullYear());
  }
}

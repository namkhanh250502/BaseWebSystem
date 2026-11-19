import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  inventoryMovementDtoSchema,
  inventoryReportRowSchema,
  productSalesRowSchema,
  profitReportSchema,
  purchaseReportSchema,
  reportPagedQuerySchema,
  reportRangeQuerySchema,
  salesByProductQuerySchema,
  salesPeriodReportSchema,
} from '@base/shared';
import type { z } from 'zod';
import type { Principal } from '../auth/principal';
import { paginated } from '../core/transform.interceptor';
import { ApiErrors, ApiZodQuery, ApiZodResponse } from '../decorators/api-docs';
import { CurrentPrincipal, RequirePermission, ZodQuery } from '../decorators/customize';
import { InventoryQueryService, type InventoryViewer } from '../inventory/inventory-query.service';
import { ReportsQueryService } from './reports-query.service';

type RangeQuery = z.infer<typeof reportRangeQuerySchema>;
type PagedQuery = z.infer<typeof reportPagedQuerySchema>;

const viewer = (principal: Principal): InventoryViewer => ({
  canViewValue: principal.can('inventory.viewValue'),
});

/** Báo cáo: chỉ chứng từ đã xác nhận, ngày theo giờ Việt Nam, khoảng tối đa 366 ngày */
@ApiTags('reports')
@ApiErrors(401, 403, 422)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsQueryService,
    private readonly inventoryQuery: InventoryQueryService,
  ) {}

  @RequirePermission('reports.sales')
  @ApiZodQuery(reportRangeQuerySchema)
  @ApiZodResponse(salesPeriodReportSchema)
  @Get('sales/daily')
  daily(@ZodQuery(reportRangeQuerySchema) query: RangeQuery) {
    return this.reports.salesByPeriod(query, 'day');
  }

  @RequirePermission('reports.sales')
  @ApiZodQuery(reportRangeQuerySchema)
  @ApiZodResponse(salesPeriodReportSchema)
  @Get('sales/monthly')
  monthly(@ZodQuery(reportRangeQuerySchema) query: RangeQuery) {
    return this.reports.salesByPeriod(query, 'month');
  }

  /** Bán theo sản phẩm; `sortBy=quantity` = sản phẩm bán chạy */
  @RequirePermission('reports.sales')
  @ApiZodQuery(salesByProductQuerySchema)
  @ApiZodResponse(productSalesRowSchema, { paginated: true })
  @Get('sales/by-product')
  async byProduct(
    @ZodQuery(salesByProductQuerySchema) query: z.infer<typeof salesByProductQuerySchema>,
  ) {
    return paginated(await this.reports.salesByProduct(query));
  }

  @RequirePermission('reports.profit')
  @ApiZodQuery(reportRangeQuerySchema)
  @ApiZodResponse(profitReportSchema)
  @Get('profit')
  profit(@ZodQuery(reportRangeQuerySchema) query: RangeQuery) {
    return this.reports.profit(query);
  }

  @RequirePermission('reports.purchases')
  @ApiZodQuery(reportRangeQuerySchema)
  @ApiZodResponse(purchaseReportSchema)
  @Get('purchases')
  purchases(@ZodQuery(reportRangeQuerySchema) query: RangeQuery) {
    return this.reports.purchases(query);
  }

  @RequirePermission('reports.inventory')
  @ApiZodQuery(reportPagedQuerySchema)
  @ApiZodResponse(inventoryReportRowSchema, { paginated: true })
  @Get('inventory')
  async inventory(
    @ZodQuery(reportPagedQuerySchema) query: PagedQuery,
    @CurrentPrincipal() principal: Principal,
  ) {
    return paginated(await this.reports.inventory(query, viewer(principal)));
  }

  @RequirePermission('reports.inventory')
  @ApiZodQuery(reportPagedQuerySchema)
  @ApiZodResponse(inventoryMovementDtoSchema, { paginated: true })
  @Get('inventory-movements')
  async movements(
    @ZodQuery(reportPagedQuerySchema) query: PagedQuery,
    @CurrentPrincipal() principal: Principal,
  ) {
    return paginated(
      await this.inventoryQuery.movements(
        {
          page: query.page,
          pageSize: query.pageSize,
          productId: query.productId,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          sortOrder: 'asc',
        },
        viewer(principal),
      ),
    );
  }
}

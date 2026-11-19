import { Controller, Get, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  createAdjustmentSchema,
  idParamSchema,
  inventoryAdjustmentDetailDtoSchema,
  inventoryAdjustmentDtoSchema,
  inventoryItemDtoSchema,
  inventoryMovementDtoSchema,
  inventorySummarySchema,
  listAdjustmentsQuerySchema,
  listInventoryQuerySchema,
  listMovementsQuerySchema,
  type IdParam,
} from '@base/shared';
import type { z } from 'zod';
import type { Principal } from '../auth/principal';
import { paginated } from '../core/transform.interceptor';
import { ApiErrors, ApiZodBody, ApiZodQuery, ApiZodResponse } from '../decorators/api-docs';
import {
  CurrentPrincipal,
  RequirePermission,
  ZodBody,
  ZodParams,
  ZodQuery,
} from '../decorators/customize';
import { AdjustmentsService } from './adjustments.service';
import { InventoryQueryService, type InventoryViewer } from './inventory-query.service';

const viewer = (principal: Principal): InventoryViewer => ({
  canViewValue: principal.can('inventory.viewValue'),
});

@ApiTags('inventory')
@ApiErrors(401, 403)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly query: InventoryQueryService,
    private readonly adjustments: AdjustmentsService,
  ) {}

  @RequirePermission('inventory.list')
  @ApiZodQuery(listInventoryQuerySchema)
  @ApiZodResponse(inventoryItemDtoSchema, { paginated: true })
  @Get()
  async list(
    @ZodQuery(listInventoryQuerySchema) query: z.infer<typeof listInventoryQuerySchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return paginated(await this.query.list(query, viewer(principal)));
  }

  /** Tổng hợp theo cùng bộ lọc với danh sách (không áp lọc trạng thái tồn) */
  @RequirePermission('inventory.list')
  @ApiZodQuery(listInventoryQuerySchema)
  @ApiZodResponse(inventorySummarySchema)
  @Get('summary')
  summary(
    @ZodQuery(listInventoryQuerySchema) query: z.infer<typeof listInventoryQuerySchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.query.summary(query, viewer(principal));
  }

  @RequirePermission('inventory.movements')
  @ApiZodQuery(listMovementsQuerySchema)
  @ApiZodResponse(inventoryMovementDtoSchema, { paginated: true })
  @Get('movements')
  async movements(
    @ZodQuery(listMovementsQuerySchema) query: z.infer<typeof listMovementsQuerySchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return paginated(await this.query.movements(query, viewer(principal)));
  }

  @RequirePermission('inventory.adjustments.list')
  @ApiZodQuery(listAdjustmentsQuerySchema)
  @ApiZodResponse(inventoryAdjustmentDtoSchema, { paginated: true })
  @Get('adjustments')
  async listAdjustments(
    @ZodQuery(listAdjustmentsQuerySchema) query: z.infer<typeof listAdjustmentsQuerySchema>,
  ) {
    return paginated(await this.adjustments.list(query));
  }

  @RequirePermission('inventory.adjustments.list')
  @ApiZodResponse(inventoryAdjustmentDetailDtoSchema)
  @ApiErrors(404)
  @Get('adjustments/:id')
  getAdjustment(
    @ZodParams(idParamSchema) { id }: IdParam,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.adjustments.get(id, viewer(principal));
  }

  /** 201 khi tạo mới; 200 khi gửi lại cùng clientRequestId */
  @RequirePermission('inventory.adjust')
  @ApiZodBody(createAdjustmentSchema)
  @ApiZodResponse(inventoryAdjustmentDetailDtoSchema, { status: 201 })
  @ApiErrors(404, 409, 422)
  @Post('adjustments')
  async createAdjustment(
    @ZodBody(createAdjustmentSchema) input: z.infer<typeof createAdjustmentSchema>,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { adjustment, created } = await this.adjustments.create(
      input,
      principal.user.id,
      viewer(principal),
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return adjustment;
  }
}

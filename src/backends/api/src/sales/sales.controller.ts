import { Controller, Get, HttpCode, HttpStatus, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  cancelDocumentSchema,
  confirmSalesOrderSchema,
  createSalesOrderSchema,
  idParamSchema,
  listSalesOrdersQuerySchema,
  paySalesOrderSchema,
  salesOrderDetailDtoSchema,
  salesOrderDtoSchema,
  updateSalesOrderSchema,
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
import { SalesService, toSalesActor } from './sales.service';

@ApiTags('sales-orders')
@ApiErrors(401, 403)
@Controller('sales-orders')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @RequirePermission('sales.list')
  @ApiZodQuery(listSalesOrdersQuerySchema)
  @ApiZodResponse(salesOrderDtoSchema, { paginated: true })
  @Get()
  async list(
    @ZodQuery(listSalesOrdersQuerySchema) query: z.infer<typeof listSalesOrdersQuerySchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return paginated(await this.salesService.list(query, toSalesActor(principal)));
  }

  @RequirePermission('sales.list')
  @ApiZodResponse(salesOrderDetailDtoSchema)
  @ApiErrors(404)
  @Get(':id')
  get(@ZodParams(idParamSchema) { id }: IdParam, @CurrentPrincipal() principal: Principal) {
    return this.salesService.get(id, toSalesActor(principal));
  }

  /** 201 khi tạo mới; 200 khi gửi lại cùng clientRequestId (trả về đơn đã tạo) */
  @RequirePermission('sales.create')
  @ApiZodBody(createSalesOrderSchema)
  @ApiZodResponse(salesOrderDetailDtoSchema, { status: 201 })
  @ApiZodResponse(salesOrderDetailDtoSchema, { description: 'Đơn đã tạo trước đó (idempotent)' })
  @ApiErrors(404, 409, 422)
  @Post()
  async create(
    @ZodBody(createSalesOrderSchema) input: z.infer<typeof createSalesOrderSchema>,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { order, created } = await this.salesService.create(input, toSalesActor(principal));
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return order;
  }

  @RequirePermission('sales.update')
  @ApiZodBody(updateSalesOrderSchema)
  @ApiZodResponse(salesOrderDetailDtoSchema)
  @ApiErrors(404, 409, 422)
  @Patch(':id')
  update(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(updateSalesOrderSchema) input: z.infer<typeof updateSalesOrderSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.salesService.update(id, input, toSalesActor(principal));
  }

  @RequirePermission('sales.confirm')
  @ApiZodBody(confirmSalesOrderSchema)
  @ApiZodResponse(salesOrderDetailDtoSchema)
  @ApiErrors(404, 409, 422)
  @HttpCode(HttpStatus.OK)
  @Post(':id/confirm')
  confirm(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(confirmSalesOrderSchema) input: z.infer<typeof confirmSalesOrderSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.salesService.confirm(id, input, toSalesActor(principal));
  }

  @RequirePermission('sales.pay')
  @ApiZodBody(paySalesOrderSchema)
  @ApiZodResponse(salesOrderDetailDtoSchema)
  @ApiErrors(404, 409)
  @HttpCode(HttpStatus.OK)
  @Post(':id/pay')
  pay(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(paySalesOrderSchema) input: z.infer<typeof paySalesOrderSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.salesService.pay(id, input, toSalesActor(principal));
  }

  /** Huỷ đơn nháp của mình (sales.update) hoặc đơn đã chốt (sales.cancel — kiểm tra trong service) */
  @RequirePermission('sales.cancel', 'sales.update')
  @ApiZodBody(cancelDocumentSchema)
  @ApiZodResponse(salesOrderDetailDtoSchema)
  @ApiErrors(404, 409)
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(cancelDocumentSchema) input: z.infer<typeof cancelDocumentSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.salesService.cancel(id, input, toSalesActor(principal));
  }
}

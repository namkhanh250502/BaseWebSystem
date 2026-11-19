import { Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  cancelDocumentSchema,
  createPurchaseSchema,
  documentVersionSchema,
  idParamSchema,
  listPurchasesQuerySchema,
  purchaseReceiptDetailDtoSchema,
  purchaseReceiptDtoSchema,
  updatePurchaseSchema,
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
import { PurchasesService } from './purchases.service';

@ApiTags('purchases')
@ApiErrors(401, 403)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @RequirePermission('purchases.list')
  @ApiZodQuery(listPurchasesQuerySchema)
  @ApiZodResponse(purchaseReceiptDtoSchema, { paginated: true })
  @Get()
  async list(@ZodQuery(listPurchasesQuerySchema) query: z.infer<typeof listPurchasesQuerySchema>) {
    return paginated(await this.purchasesService.list(query));
  }

  @RequirePermission('purchases.list')
  @ApiZodResponse(purchaseReceiptDetailDtoSchema)
  @ApiErrors(404)
  @Get(':id')
  get(@ZodParams(idParamSchema) { id }: IdParam) {
    return this.purchasesService.get(id);
  }

  @RequirePermission('purchases.create')
  @ApiZodBody(createPurchaseSchema)
  @ApiZodResponse(purchaseReceiptDetailDtoSchema, { status: 201 })
  @ApiErrors(404, 422)
  @Post()
  create(
    @ZodBody(createPurchaseSchema) input: z.infer<typeof createPurchaseSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.purchasesService.create(input, principal.user.id);
  }

  @RequirePermission('purchases.update')
  @ApiZodBody(updatePurchaseSchema)
  @ApiZodResponse(purchaseReceiptDetailDtoSchema)
  @ApiErrors(404, 409, 422)
  @Patch(':id')
  update(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(updatePurchaseSchema) input: z.infer<typeof updatePurchaseSchema>,
  ) {
    return this.purchasesService.update(id, input);
  }

  @RequirePermission('purchases.confirm')
  @ApiZodBody(documentVersionSchema)
  @ApiZodResponse(purchaseReceiptDetailDtoSchema)
  @ApiErrors(404, 409, 422)
  @HttpCode(HttpStatus.OK)
  @Post(':id/confirm')
  confirm(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(documentVersionSchema) input: z.infer<typeof documentVersionSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.purchasesService.confirm(id, input, principal.user.id);
  }

  @RequirePermission('purchases.cancel')
  @ApiZodBody(cancelDocumentSchema)
  @ApiZodResponse(purchaseReceiptDetailDtoSchema)
  @ApiErrors(404, 409)
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(cancelDocumentSchema) input: z.infer<typeof cancelDocumentSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.purchasesService.cancel(id, input, principal.user.id);
  }
}

import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  salesOrderItems,
  salesOrders,
  type SalesOrder,
  type SalesOrderItem,
} from '@base/db';
import {
  businessDate,
  DOCUMENT_CODE_PREFIXES,
  type cancelDocumentSchema,
  type confirmSalesOrderSchema,
  type createSalesOrderSchema,
  type listSalesOrdersQuerySchema,
  type PaymentMethod,
  type paySalesOrderSchema,
  type salesOrderInputSchema,
  type SalesOrderDetailDto,
  type SalesOrderDto,
  type updateSalesOrderSchema,
} from '@base/shared';
import {
  cmp,
  conflict,
  COST_SCALE,
  decimal,
  forbidden,
  MONEY_SCALE,
  mul,
  notFound,
  QUANTITY_SCALE,
  sub,
  sum,
} from '@base/server-kit';
import type { z } from 'zod';
import type { Principal } from '../auth/principal';
import { InjectDb, type Database, type DbOrTx, type Tx } from '../core/database';
import {
  containsPattern,
  isUniqueViolation,
  iso,
  loadUserRefs,
  pageMeta,
} from '../core/query-helpers';
import { DocumentCodeService } from '../inventory/document-code.service';
import { InventoryService } from '../inventory/inventory.service';
import { loadProductsForDocument } from '../products/product-lines';
import { allocateDocumentDiscount, money, priceDocument, qty } from './pricing';

type ListQuery = z.infer<typeof listSalesOrdersQuerySchema>;
type OrderInput = z.infer<typeof salesOrderInputSchema>;
type CreateInput = z.infer<typeof createSalesOrderSchema>;
type UpdateInput = z.infer<typeof updateSalesOrderSchema>;
type ConfirmInput = z.infer<typeof confirmSalesOrderSchema>;
type PayInput = z.infer<typeof paySalesOrderSchema>;
type CancelInput = z.infer<typeof cancelDocumentSchema>;

/** Quyền hiệu lực của người thao tác với đơn bán */
export interface SalesActor {
  userId: string;
  /** Xem / thao tác đơn của mọi người (sales.viewAll); thiếu → chỉ đơn mình tạo */
  canViewAll: boolean;
  canViewCost: boolean;
  canOverridePrice: boolean;
  canCancelConfirmed: boolean;
}

export function toSalesActor(principal: Principal): SalesActor {
  return {
    userId: principal.user.id,
    canViewAll: principal.can('sales.viewAll'),
    canViewCost: principal.can('products.viewCost'),
    canOverridePrice: principal.can('sales.overridePrice'),
    canCancelConfirmed: principal.can('sales.cancel'),
  };
}

const SORT_COLUMNS = {
  orderDate: salesOrders.orderDate,
  code: salesOrders.code,
  totalAmount: salesOrders.totalAmount,
  createdAt: salesOrders.createdAt,
} as const;

/**
 * Đơn bán: Nháp (không đổi tồn) → Chốt (kiểm tra + trừ tồn, chốt giá bán + giá vốn, đúng một
 * lần) → Thanh toán (UNPAID → PAID một chiều) → Huỷ (cộng lại tồn theo giá vốn đã lưu).
 */
@Injectable()
export class SalesService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly inventory: InventoryService,
    private readonly codes: DocumentCodeService,
  ) {}

  // ----- Đọc -----

  private async toDtos(rows: SalesOrder[], actor: SalesActor): Promise<SalesOrderDto[]> {
    if (!rows.length) return [];
    const [counts, userRef] = await Promise.all([
      this.db
        .select({ orderId: salesOrderItems.orderId, value: count() })
        .from(salesOrderItems)
        .where(
          inArray(
            salesOrderItems.orderId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(salesOrderItems.orderId),
      loadUserRefs(
        this.db,
        rows.flatMap((r) => [r.createdBy, r.confirmedBy, r.cancelledBy, r.paidBy]),
      ),
    ]);
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      orderDate: r.orderDate,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      status: r.status,
      paymentMethod: r.paymentMethod,
      paymentStatus: r.paymentStatus,
      paidAt: iso(r.paidAt),
      itemCount: counts.find((c) => c.orderId === r.id)?.value ?? 0,
      subtotal: r.subtotal,
      discountAmount: r.discountAmount,
      totalAmount: r.totalAmount,
      ...(actor.canViewCost ? { totalCost: r.totalCost } : {}),
      notes: r.notes,
      cancelReason: r.cancelReason,
      version: r.version,
      createdBy: userRef(r.createdBy),
      confirmedBy: userRef(r.confirmedBy),
      cancelledBy: userRef(r.cancelledBy),
      paidBy: userRef(r.paidBy),
      confirmedAt: iso(r.confirmedAt),
      cancelledAt: iso(r.cancelledAt),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /** Đơn của người khác mà không có sales.viewAll → coi như không tồn tại (không lộ dữ liệu) */
  private assertVisible(order: SalesOrder | undefined, actor: SalesActor): SalesOrder {
    if (!order || (!actor.canViewAll && order.createdBy !== actor.userId)) {
      throw notFound('sales.notFound');
    }
    return order;
  }

  private async findVisible(id: string, actor: SalesActor, db: DbOrTx = this.db) {
    const [row] = await db.select().from(salesOrders).where(eq(salesOrders.id, id));
    return this.assertVisible(row, actor);
  }

  async list(query: ListQuery, actor: SalesActor) {
    const { page, pageSize, search, status, paymentStatus, paymentMethod, dateFrom, dateTo } =
      query;
    const createdBy = !actor.canViewAll || query.mine ? actor.userId : query.createdById;
    const pattern = search ? containsPattern(search) : undefined;
    const where = and(
      pattern
        ? or(ilike(salesOrders.code, pattern), ilike(salesOrders.customerPhone, pattern))
        : undefined,
      status ? eq(salesOrders.status, status) : undefined,
      paymentStatus ? eq(salesOrders.paymentStatus, paymentStatus) : undefined,
      paymentMethod ? eq(salesOrders.paymentMethod, paymentMethod) : undefined,
      dateFrom ? gte(salesOrders.orderDate, dateFrom) : undefined,
      dateTo ? lte(salesOrders.orderDate, dateTo) : undefined,
      createdBy ? eq(salesOrders.createdBy, createdBy) : undefined,
    );
    const order = query.sortOrder === 'asc' ? asc : desc;
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(salesOrders)
        .where(where)
        .orderBy(order(SORT_COLUMNS[query.sortBy]), desc(salesOrders.code))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(salesOrders).where(where),
    ]);
    return { items: await this.toDtos(rows, actor), meta: pageMeta(page, pageSize, total?.value) };
  }

  async get(id: string, actor: SalesActor): Promise<SalesOrderDetailDto> {
    const order = await this.findVisible(id, actor);
    const [[dto], items] = await Promise.all([
      this.toDtos([order], actor),
      this.db
        .select()
        .from(salesOrderItems)
        .where(eq(salesOrderItems.orderId, id))
        .orderBy(asc(salesOrderItems.lineNo)),
    ]);
    return { ...dto!, items: items.map((i) => this.toItemDto(i, actor)) };
  }

  private toItemDto(item: SalesOrderItem, actor: SalesActor) {
    return {
      id: item.id,
      lineNo: item.lineNo,
      productId: item.productId,
      sku: item.skuSnapshot,
      name: item.nameSnapshot,
      unit: item.unitSnapshot,
      quantity: item.quantity,
      listPrice: item.listPrice,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      lineAmount: item.lineAmount,
      allocatedOrderDiscount: item.allocatedOrderDiscount,
      netAmount: item.netAmount,
      ...(actor.canViewCost ? { unitCost: item.unitCost, costAmount: item.costAmount } : {}),
    };
  }

  // ----- Ghi -----

  /** Kiểm tra sản phẩm + quyền sửa giá, tính tiền, ghi lại dòng đơn (snapshot SKU / tên / giá) */
  private async writeLines(tx: Tx, orderId: string, input: OrderInput, actor: SalesActor) {
    const byId = await loadProductsForDocument(tx, input.items, {
      requireActive: true,
    });
    const lines = input.items.map((item) => {
      const product = byId.get(item.productId)!;
      const unitPrice = item.unitPrice ?? product.sellingPrice;
      const overridden =
        cmp(decimal(unitPrice, MONEY_SCALE), decimal(product.sellingPrice, MONEY_SCALE)) !== 0;
      if (overridden && !actor.canOverridePrice) throw forbidden('sales.priceOverrideForbidden');
      return { item, product, unitPrice };
    });
    const priced = priceDocument(
      lines.map((l) => ({
        quantity: l.item.quantity,
        unitPrice: l.unitPrice,
        discountAmount: l.item.discountAmount,
      })),
      input.discountAmount,
    );
    await tx.delete(salesOrderItems).where(eq(salesOrderItems.orderId, orderId));
    await tx.insert(salesOrderItems).values(
      lines.map(({ item, product }, i) => ({
        orderId,
        productId: item.productId,
        lineNo: i + 1,
        skuSnapshot: product.sku,
        nameSnapshot: product.name,
        unitSnapshot: product.unit,
        quantity: qty(priced.lines[i]!.quantity),
        listPrice: product.sellingPrice,
        unitPrice: money(priced.lines[i]!.unitPrice),
        discountAmount: money(priced.lines[i]!.discountAmount),
        lineAmount: money(priced.lines[i]!.lineAmount),
      })),
    );
    return {
      orderDate: input.orderDate ?? businessDate(),
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      paymentMethod: input.paymentMethod,
      notes: input.notes ?? null,
      subtotal: money(priced.subtotal),
      discountAmount: money(priced.discountAmount),
      totalAmount: money(priced.totalAmount),
    };
  }

  /**
   * Tạo đơn (nháp hoặc chốt ngay). Idempotent theo `clientRequestId`: gửi lại trả về đơn đã tạo
   * với `created = false` (controller trả 200 thay vì 201).
   */
  async create(
    { clientRequestId, confirm, markPaid, ...input }: CreateInput,
    actor: SalesActor,
  ): Promise<{ order: SalesOrderDetailDto; created: boolean }> {
    const existing = await this.findByRequestId(clientRequestId, actor);
    if (existing) return { order: existing, created: false };
    try {
      const id = await this.db.transaction(async (tx) => {
        const code = await this.codes.next(tx, DOCUMENT_CODE_PREFIXES.SALES_ORDER);
        const [order] = await tx
          .insert(salesOrders)
          .values({
            code,
            clientRequestId,
            orderDate: input.orderDate ?? businessDate(),
            createdBy: actor.userId,
          })
          .returning();
        const header = await this.writeLines(tx, order!.id, input, actor);
        await tx.update(salesOrders).set(header).where(eq(salesOrders.id, order!.id));
        if (confirm) {
          await this.confirmInTx(tx, order!.id, order!.version, actor, {
            markPaid,
            paymentMethod: input.paymentMethod,
          });
        }
        return order!.id;
      });
      return { order: await this.get(id, actor), created: true };
    } catch (error) {
      // Hai request cùng clientRequestId chạy song song: request thua trả về đơn đã tạo
      if (isUniqueViolation(error)) {
        const order = await this.findByRequestId(clientRequestId, actor);
        if (order) return { order, created: false };
      }
      throw error;
    }
  }

  private async findByRequestId(clientRequestId: string, actor: SalesActor) {
    const [row] = await this.db
      .select({ id: salesOrders.id })
      .from(salesOrders)
      .where(eq(salesOrders.clientRequestId, clientRequestId));
    return row ? this.get(row.id, actor) : null;
  }

  /** Khoá đơn để sửa / huỷ; kiểm tra phạm vi, phiên bản */
  private async lockOrder(tx: Tx, id: string, version: number, actor: SalesActor) {
    const [row] = await tx.select().from(salesOrders).where(eq(salesOrders.id, id)).for('update');
    const order = this.assertVisible(row, actor);
    if (order.version !== version) throw conflict('sales.stale');
    return order;
  }

  async update(id: string, { version, ...input }: UpdateInput, actor: SalesActor) {
    await this.db.transaction(async (tx) => {
      const order = await this.lockOrder(tx, id, version, actor);
      if (order.status !== 'DRAFT') throw conflict('sales.notDraft');
      const header = await this.writeLines(tx, id, input, actor);
      await tx
        .update(salesOrders)
        .set({ ...header, version: version + 1 })
        .where(eq(salesOrders.id, id));
    });
    return this.get(id, actor);
  }

  /**
   * Chốt đơn trong `tx`: chuyển trạng thái có điều kiện trước (chống chốt trùng), kiểm tra lại
   * sản phẩm còn kinh doanh, trừ tồn (thiếu hàng → rollback toàn bộ), lưu giá vốn + doanh thu thuần.
   */
  private async confirmInTx(
    tx: Tx,
    id: string,
    version: number,
    actor: SalesActor,
    payment: { markPaid: boolean; paymentMethod?: PaymentMethod },
  ) {
    const now = new Date();
    const [order] = await tx
      .update(salesOrders)
      .set({
        status: 'CONFIRMED',
        confirmedBy: actor.userId,
        confirmedAt: now,
        version: version + 1,
        ...(payment.paymentMethod ? { paymentMethod: payment.paymentMethod } : {}),
        ...(payment.markPaid
          ? { paymentStatus: 'PAID' as const, paidAt: now, paidBy: actor.userId }
          : {}),
      })
      .where(
        and(
          eq(salesOrders.id, id),
          eq(salesOrders.status, 'DRAFT'),
          eq(salesOrders.version, version),
          actor.canViewAll ? undefined : eq(salesOrders.createdBy, actor.userId),
        ),
      )
      .returning();
    if (!order) {
      const [current] = await tx.select().from(salesOrders).where(eq(salesOrders.id, id));
      const visible = this.assertVisible(current, actor);
      throw conflict(visible.status !== 'DRAFT' ? 'sales.alreadyProcessed' : 'sales.stale');
    }
    const items = await tx
      .select()
      .from(salesOrderItems)
      .where(eq(salesOrderItems.orderId, id))
      .orderBy(asc(salesOrderItems.lineNo));
    await loadProductsForDocument(tx, items, { requireActive: true });

    const priced = priceDocument(
      items.map((i) => ({
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountAmount: i.discountAmount,
      })),
      order.discountAmount,
    );
    const allocated = allocateDocumentDiscount(priced);
    const applied = await this.inventory.apply(
      tx,
      {
        type: 'SALE_OUT',
        refType: 'SALES_ORDER',
        refId: order.id,
        refCode: order.code,
        userId: actor.userId,
        shortageKey: 'sales.insufficientStock',
      },
      items.map((item) => ({
        productId: item.productId,
        quantity: sub(decimal(0, QUANTITY_SCALE), decimal(item.quantity, QUANTITY_SCALE)),
        refItemId: item.id,
      })),
    );
    const costs = items.map((item, i) => {
      const unitCost = decimal(applied[i]!.unitCost, COST_SCALE);
      return {
        unitCost,
        costAmount: mul(decimal(item.quantity, QUANTITY_SCALE), unitCost, MONEY_SCALE),
      };
    });
    for (const [i, item] of items.entries()) {
      await tx
        .update(salesOrderItems)
        .set({
          allocatedOrderDiscount: money(allocated[i]!),
          netAmount: money(sub(priced.lines[i]!.lineAmount, allocated[i]!)),
          unitCost: applied[i]!.unitCost,
          costAmount: money(costs[i]!.costAmount),
        })
        .where(eq(salesOrderItems.id, item.id));
    }
    await tx
      .update(salesOrders)
      .set({
        totalCost: money(
          sum(
            costs.map((c) => c.costAmount),
            MONEY_SCALE,
          ),
        ),
      })
      .where(eq(salesOrders.id, id));
  }

  async confirm(id: string, input: ConfirmInput, actor: SalesActor) {
    await this.db.transaction((tx) =>
      this.confirmInTx(tx, id, input.version, actor, {
        markPaid: input.markPaid,
        paymentMethod: input.paymentMethod,
      }),
    );
    return this.get(id, actor);
  }

  /** Ghi nhận thanh toán toàn bộ (UNPAID → PAID một chiều, spec Q2) */
  async pay(id: string, { paymentMethod }: PayInput, actor: SalesActor) {
    const [updated] = await this.db
      .update(salesOrders)
      .set({
        paymentStatus: 'PAID',
        paidAt: new Date(),
        paidBy: actor.userId,
        ...(paymentMethod ? { paymentMethod } : {}),
      })
      .where(
        and(
          eq(salesOrders.id, id),
          eq(salesOrders.status, 'CONFIRMED'),
          eq(salesOrders.paymentStatus, 'UNPAID'),
          actor.canViewAll ? undefined : eq(salesOrders.createdBy, actor.userId),
        ),
      )
      .returning({ id: salesOrders.id });
    if (!updated) {
      const order = await this.findVisible(id, actor);
      if (order.status !== 'CONFIRMED') throw conflict('sales.notConfirmed');
      throw conflict('sales.alreadyPaid');
    }
    return this.get(id, actor);
  }

  /**
   * Huỷ đơn. Nháp: người tạo (hoặc người xem được mọi đơn) huỷ, không đổi tồn.
   * Đã chốt: cần sales.cancel, cộng lại tồn theo giá vốn đã lưu trên từng dòng (FR-022).
   */
  async cancel(id: string, { version, reason }: CancelInput, actor: SalesActor) {
    await this.db.transaction(async (tx) => {
      const order = await this.lockOrder(tx, id, version, actor);
      if (order.status === 'CANCELLED') throw conflict('sales.alreadyCancelled');
      if (order.status === 'CONFIRMED') {
        if (!actor.canCancelConfirmed) throw forbidden('sales.cancelForbidden');
        const items = await tx
          .select()
          .from(salesOrderItems)
          .where(eq(salesOrderItems.orderId, id))
          .orderBy(asc(salesOrderItems.lineNo));
        await this.inventory.apply(
          tx,
          {
            type: 'SALE_CANCEL_IN',
            refType: 'SALES_ORDER',
            refId: order.id,
            refCode: order.code,
            userId: actor.userId,
            note: reason ?? null,
          },
          items.map((item) => ({
            productId: item.productId,
            quantity: decimal(item.quantity, QUANTITY_SCALE),
            unitCost: decimal(item.unitCost ?? '0', COST_SCALE),
            refItemId: item.id,
          })),
        );
      }
      await tx
        .update(salesOrders)
        .set({
          status: 'CANCELLED',
          cancelReason: reason ?? null,
          cancelledBy: actor.userId,
          cancelledAt: new Date(),
          version: version + 1,
        })
        .where(eq(salesOrders.id, id));
    });
    return this.get(id, actor);
  }
}

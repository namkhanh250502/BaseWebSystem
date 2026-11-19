import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  inventoryAdjustmentItems,
  inventoryAdjustments,
  inventoryBalances,
  products,
  sql,
  type InventoryAdjustment,
} from '@base/db';
import {
  DOCUMENT_CODE_PREFIXES,
  type createAdjustmentSchema,
  type InventoryAdjustmentDetailDto,
  type InventoryAdjustmentDto,
  type listAdjustmentsQuerySchema,
} from '@base/shared';
import {
  decimal,
  isNegative,
  isZero,
  notFound,
  QUANTITY_SCALE,
  sub,
  unprocessable,
  type Decimal,
} from '@base/server-kit';
import type { z } from 'zod';
import { InjectDb, type Database } from '../core/database';
import {
  businessDay,
  containsPattern,
  isUniqueViolation,
  loadUserRefs,
  pageMeta,
} from '../core/query-helpers';
import { loadProductsForDocument } from '../products/product-lines';
import { qty } from '../sales/pricing';
import { DocumentCodeService } from './document-code.service';
import type { InventoryViewer } from './inventory-query.service';
import { InventoryService } from './inventory.service';

type CreateInput = z.infer<typeof createAdjustmentSchema>;
type ListQuery = z.infer<typeof listAdjustmentsQuerySchema>;

/**
 * Phiếu điều chỉnh tồn (áp dụng ngay): lý do bắt buộc, kiểm kê nhập số đếm thực tế → hệ thống
 * tính chênh lệch trên tồn đã khoá. Không bao giờ để tồn âm; giá vốn bình quân không đổi.
 */
@Injectable()
export class AdjustmentsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly inventory: InventoryService,
    private readonly codes: DocumentCodeService,
  ) {}

  private async toDtos(rows: InventoryAdjustment[]): Promise<InventoryAdjustmentDto[]> {
    if (!rows.length) return [];
    const [counts, userRef] = await Promise.all([
      this.db
        .select({ adjustmentId: inventoryAdjustmentItems.adjustmentId, value: count() })
        .from(inventoryAdjustmentItems)
        .where(
          inArray(
            inventoryAdjustmentItems.adjustmentId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(inventoryAdjustmentItems.adjustmentId),
      loadUserRefs(
        this.db,
        rows.map((r) => r.createdBy),
      ),
    ]);
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      reason: r.reason,
      note: r.note,
      itemCount: counts.find((c) => c.adjustmentId === r.id)?.value ?? 0,
      createdBy: userRef(r.createdBy),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async list(query: ListQuery) {
    const { page, pageSize, reason, dateFrom, dateTo, search, sortOrder } = query;
    const day = businessDay(inventoryAdjustments.createdAt);
    const where = and(
      reason ? eq(inventoryAdjustments.reason, reason) : undefined,
      dateFrom ? sql`${day} >= ${dateFrom}` : undefined,
      dateTo ? sql`${day} <= ${dateTo}` : undefined,
      search ? ilike(inventoryAdjustments.code, containsPattern(search)) : undefined,
    );
    const order = sortOrder === 'asc' ? asc : desc;
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(inventoryAdjustments)
        .where(where)
        .orderBy(order(inventoryAdjustments.createdAt), order(inventoryAdjustments.code))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(inventoryAdjustments).where(where),
    ]);
    return { items: await this.toDtos(rows), meta: pageMeta(page, pageSize, total?.value) };
  }

  async get(id: string, viewer: InventoryViewer): Promise<InventoryAdjustmentDetailDto> {
    const [row] = await this.db
      .select()
      .from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.id, id));
    if (!row) throw notFound('inventory.adjustmentNotFound');
    const [[dto], items] = await Promise.all([
      this.toDtos([row]),
      this.db
        .select({
          item: inventoryAdjustmentItems,
          product: { id: products.id, sku: products.sku, name: products.name, unit: products.unit },
        })
        .from(inventoryAdjustmentItems)
        .innerJoin(products, eq(products.id, inventoryAdjustmentItems.productId))
        .where(eq(inventoryAdjustmentItems.adjustmentId, id))
        .orderBy(asc(products.sku)),
    ]);
    return {
      ...dto!,
      items: items.map(({ item, product }) => ({
        id: item.id,
        product,
        quantityBefore: item.quantityBefore,
        quantityChange: item.quantityChange,
        quantityAfter: item.quantityAfter,
        countedQuantity: item.countedQuantity,
        ...(viewer.canViewValue ? { unitCost: item.unitCost } : {}),
      })),
    };
  }

  private async findByRequestId(clientRequestId: string, viewer: InventoryViewer) {
    const [row] = await this.db
      .select({ id: inventoryAdjustments.id })
      .from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.clientRequestId, clientRequestId));
    return row ? this.get(row.id, viewer) : null;
  }

  /** Tạo + áp dụng phiếu; gửi lại cùng clientRequestId trả về phiếu đã tạo (`created = false`) */
  async create(input: CreateInput, userId: string, viewer: InventoryViewer) {
    const existing = await this.findByRequestId(input.clientRequestId, viewer);
    if (existing) return { adjustment: existing, created: false };
    const stocktake = input.reason === 'STOCKTAKE';
    // Kiểm tra sản phẩm tồn tại + số lượng nguyên (sản phẩm ngừng kinh doanh vẫn điều chỉnh được)
    await loadProductsForDocument(
      this.db,
      input.items.map((i) => ({
        productId: i.productId,
        quantity: (stocktake ? i.countedQuantity : i.quantityChange) ?? '0',
      })),
      { requireActive: false },
    );
    try {
      const id = await this.db.transaction(async (tx) => {
        // Khoá tồn trước để tính chênh lệch kiểm kê trên số liệu không đổi trong giao dịch
        const ids = input.items.map((i) => i.productId).sort();
        const locked = await tx
          .select({ productId: inventoryBalances.productId, quantity: inventoryBalances.quantity })
          .from(inventoryBalances)
          .where(inArray(inventoryBalances.productId, ids))
          .orderBy(asc(inventoryBalances.productId))
          .for('update');
        const current = new Map(
          locked.map((r) => [r.productId, decimal(r.quantity, QUANTITY_SCALE)]),
        );
        const changes = input.items
          .map((item) => {
            const before = current.get(item.productId) ?? decimal(0, QUANTITY_SCALE);
            const change: Decimal = stocktake
              ? sub(decimal(item.countedQuantity!, QUANTITY_SCALE), before)
              : decimal(item.quantityChange!, QUANTITY_SCALE);
            return { item, change };
          })
          .filter(({ change }) => !isZero(change));
        if (!changes.length) throw unprocessable('inventory.noChange');

        const code = await this.codes.next(tx, DOCUMENT_CODE_PREFIXES.INVENTORY_ADJUSTMENT);
        const [adjustment] = await tx
          .insert(inventoryAdjustments)
          .values({
            code,
            clientRequestId: input.clientRequestId,
            reason: input.reason,
            note: input.note ?? null,
            createdBy: userId,
          })
          .returning();
        const applied = await this.inventory.apply(
          tx,
          {
            type: 'ADJUSTMENT_IN',
            refType: 'INVENTORY_ADJUSTMENT',
            refId: adjustment!.id,
            refCode: adjustment!.code,
            userId,
            reason: input.reason,
            note: input.note ?? null,
            shortageKey: 'inventory.negativeStock',
          },
          changes.map(({ item, change }) => ({
            productId: item.productId,
            quantity: change,
            type: isNegative(change) ? ('ADJUSTMENT_OUT' as const) : ('ADJUSTMENT_IN' as const),
          })),
        );
        await tx.insert(inventoryAdjustmentItems).values(
          changes.map(({ item }, i) => ({
            adjustmentId: adjustment!.id,
            productId: item.productId,
            quantityBefore: applied[i]!.quantityBefore,
            quantityChange: qty(changes[i]!.change),
            quantityAfter: applied[i]!.quantityAfter,
            countedQuantity: stocktake ? applied[i]!.quantityAfter : null,
            unitCost: applied[i]!.unitCost,
          })),
        );
        return adjustment!.id;
      });
      return { adjustment: await this.get(id, viewer), created: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const adjustment = await this.findByRequestId(input.clientRequestId, viewer);
        if (adjustment) return { adjustment, created: false };
      }
      throw error;
    }
  }
}

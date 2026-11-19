import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lte,
  products,
  purchaseReceiptItems,
  purchaseReceipts,
  sql,
  suppliers,
  type PurchaseReceipt,
} from '@base/db';
import {
  DOCUMENT_CODE_PREFIXES,
  type cancelDocumentSchema,
  type documentVersionSchema,
  type listPurchasesQuerySchema,
  type purchaseInputSchema,
  type PurchaseReceiptDetailDto,
  type PurchaseReceiptDto,
  type updatePurchaseSchema,
} from '@base/shared';
import { conflict, decimal, notFound, QUANTITY_SCALE } from '@base/server-kit';
import type { z } from 'zod';
import { InjectDb, type Database, type DbOrTx, type Tx } from '../core/database';
import { containsPattern, iso, loadUserRefs, pageMeta } from '../core/query-helpers';
import { DocumentCodeService } from '../inventory/document-code.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { costString, money, priceDocument, purchaseUnitCosts, qty } from '../sales/pricing';
import { SuppliersService } from '../suppliers/suppliers.service';

type ListQuery = z.infer<typeof listPurchasesQuerySchema>;
type PurchaseInput = z.infer<typeof purchaseInputSchema>;
type UpdateInput = z.infer<typeof updatePurchaseSchema>;
type VersionInput = z.infer<typeof documentVersionSchema>;
type CancelInput = z.infer<typeof cancelDocumentSchema>;

const SORT_COLUMNS = {
  receiptDate: purchaseReceipts.receiptDate,
  code: purchaseReceipts.code,
  totalAmount: purchaseReceipts.totalAmount,
  createdAt: purchaseReceipts.createdAt,
} as const;

/**
 * Phiếu nhập: Nháp (sửa được, không đổi tồn) → Xác nhận (cộng tồn + giá vốn bình quân, đúng một
 * lần, phiếu trở thành bất biến — spec Q1) hoặc Huỷ (chỉ phiếu nháp).
 */
@Injectable()
export class PurchasesService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly inventory: InventoryService,
    private readonly codes: DocumentCodeService,
    private readonly productsService: ProductsService,
    private readonly suppliersService: SuppliersService,
  ) {}

  // ----- Đọc -----

  private async toDtos(rows: PurchaseReceipt[]): Promise<PurchaseReceiptDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [supplierRows, counts, userRef] = await Promise.all([
      this.db
        .select({ id: suppliers.id, name: suppliers.name })
        .from(suppliers)
        .where(inArray(suppliers.id, [...new Set(rows.map((r) => r.supplierId))])),
      this.db
        .select({ receiptId: purchaseReceiptItems.receiptId, value: count() })
        .from(purchaseReceiptItems)
        .where(inArray(purchaseReceiptItems.receiptId, ids))
        .groupBy(purchaseReceiptItems.receiptId),
      loadUserRefs(
        this.db,
        rows.flatMap((r) => [r.createdBy, r.confirmedBy, r.cancelledBy]),
      ),
    ]);
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      supplier: supplierRows.find((s) => s.id === r.supplierId)!,
      receiptDate: r.receiptDate,
      status: r.status,
      itemCount: counts.find((c) => c.receiptId === r.id)?.value ?? 0,
      subtotal: r.subtotal,
      discountAmount: r.discountAmount,
      totalAmount: r.totalAmount,
      notes: r.notes,
      cancelReason: r.cancelReason,
      version: r.version,
      createdBy: userRef(r.createdBy),
      confirmedBy: userRef(r.confirmedBy),
      cancelledBy: userRef(r.cancelledBy),
      confirmedAt: iso(r.confirmedAt),
      cancelledAt: iso(r.cancelledAt),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  private async findOrThrow(id: string, db: DbOrTx = this.db): Promise<PurchaseReceipt> {
    const [row] = await db.select().from(purchaseReceipts).where(eq(purchaseReceipts.id, id));
    if (!row) throw notFound('purchases.notFound');
    return row;
  }

  async list(query: ListQuery) {
    const { page, pageSize, search, supplierId, productId, status, dateFrom, dateTo } = query;
    const where = and(
      search ? ilike(purchaseReceipts.code, containsPattern(search)) : undefined,
      supplierId ? eq(purchaseReceipts.supplierId, supplierId) : undefined,
      status ? eq(purchaseReceipts.status, status) : undefined,
      dateFrom ? gte(purchaseReceipts.receiptDate, dateFrom) : undefined,
      dateTo ? lte(purchaseReceipts.receiptDate, dateTo) : undefined,
      productId
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(purchaseReceiptItems)
              .where(
                and(
                  eq(purchaseReceiptItems.receiptId, purchaseReceipts.id),
                  eq(purchaseReceiptItems.productId, productId),
                ),
              ),
          )
        : undefined,
    );
    const order = query.sortOrder === 'asc' ? asc : desc;
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(purchaseReceipts)
        .where(where)
        .orderBy(order(SORT_COLUMNS[query.sortBy]), desc(purchaseReceipts.code))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(purchaseReceipts).where(where),
    ]);
    return { items: await this.toDtos(rows), meta: pageMeta(page, pageSize, total?.value) };
  }

  async get(id: string): Promise<PurchaseReceiptDetailDto> {
    const receipt = await this.findOrThrow(id);
    const [[dto], items] = await Promise.all([
      this.toDtos([receipt]),
      this.db
        .select({
          item: purchaseReceiptItems,
          product: { id: products.id, sku: products.sku, name: products.name, unit: products.unit },
        })
        .from(purchaseReceiptItems)
        .innerJoin(products, eq(products.id, purchaseReceiptItems.productId))
        .where(eq(purchaseReceiptItems.receiptId, id))
        .orderBy(asc(purchaseReceiptItems.lineNo)),
    ]);
    return {
      ...dto!,
      items: items.map(({ item, product }) => ({
        id: item.id,
        lineNo: item.lineNo,
        product,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        lineAmount: item.lineAmount,
        unitCost: item.unitCost,
      })),
    };
  }

  // ----- Ghi -----

  /** Kiểm tra + tính tiền; ghi dòng phiếu (xoá dòng cũ khi sửa) */
  private async writeLines(tx: Tx, receiptId: string, input: PurchaseInput) {
    await this.suppliersService.assertActive(input.supplierId, tx);
    await this.productsService.loadForDocument(tx, input.items, { requireActive: true });
    const priced = priceDocument(input.items, input.discountAmount);
    await tx.delete(purchaseReceiptItems).where(eq(purchaseReceiptItems.receiptId, receiptId));
    await tx.insert(purchaseReceiptItems).values(
      input.items.map((item, i) => ({
        receiptId,
        productId: item.productId,
        lineNo: i + 1,
        quantity: qty(priced.lines[i]!.quantity),
        unitPrice: money(priced.lines[i]!.unitPrice),
        discountAmount: money(priced.lines[i]!.discountAmount),
        lineAmount: money(priced.lines[i]!.lineAmount),
      })),
    );
    return {
      supplierId: input.supplierId,
      receiptDate: input.receiptDate,
      notes: input.notes ?? null,
      subtotal: money(priced.subtotal),
      discountAmount: money(priced.discountAmount),
      totalAmount: money(priced.totalAmount),
    };
  }

  async create(input: PurchaseInput, userId: string): Promise<PurchaseReceiptDetailDto> {
    const id = await this.db.transaction(async (tx) => {
      const code = await this.codes.next(tx, DOCUMENT_CODE_PREFIXES.PURCHASE_RECEIPT);
      const [receipt] = await tx
        .insert(purchaseReceipts)
        .values({
          code,
          supplierId: input.supplierId,
          receiptDate: input.receiptDate,
          createdBy: userId,
        })
        .returning({ id: purchaseReceipts.id });
      const header = await this.writeLines(tx, receipt!.id, input);
      await tx.update(purchaseReceipts).set(header).where(eq(purchaseReceipts.id, receipt!.id));
      return receipt!.id;
    });
    return this.get(id);
  }

  /** Khoá phiếu nháp để sửa / huỷ; trạng thái hoặc phiên bản lệch → 409 */
  private async lockDraft(tx: Tx, id: string, version: number): Promise<PurchaseReceipt> {
    const [row] = await tx
      .select()
      .from(purchaseReceipts)
      .where(eq(purchaseReceipts.id, id))
      .for('update');
    if (!row) throw notFound('purchases.notFound');
    if (row.status !== 'DRAFT') throw conflict('purchases.notDraft');
    if (row.version !== version) throw conflict('purchases.stale');
    return row;
  }

  async update(id: string, { version, ...input }: UpdateInput): Promise<PurchaseReceiptDetailDto> {
    await this.db.transaction(async (tx) => {
      await this.lockDraft(tx, id, version);
      const header = await this.writeLines(tx, id, input);
      await tx
        .update(purchaseReceipts)
        .set({ ...header, version: version + 1 })
        .where(eq(purchaseReceipts.id, id));
    });
    return this.get(id);
  }

  /**
   * Xác nhận: chuyển trạng thái có điều kiện (DRAFT + đúng version) là bước đầu tiên, nên hai
   * yêu cầu đồng thời chỉ một cái thành công (FR-015); sau đó cộng tồn + giá vốn trong cùng TX.
   */
  async confirm(id: string, { version }: VersionInput, userId: string) {
    await this.db.transaction(async (tx) => {
      const now = new Date();
      const [receipt] = await tx
        .update(purchaseReceipts)
        .set({ status: 'CONFIRMED', confirmedBy: userId, confirmedAt: now, version: version + 1 })
        .where(
          and(
            eq(purchaseReceipts.id, id),
            eq(purchaseReceipts.status, 'DRAFT'),
            eq(purchaseReceipts.version, version),
          ),
        )
        .returning();
      if (!receipt) {
        const current = await this.findOrThrow(id, tx);
        throw conflict(
          current.status !== 'DRAFT' ? 'purchases.alreadyProcessed' : 'purchases.stale',
        );
      }
      const items = await tx
        .select()
        .from(purchaseReceiptItems)
        .where(eq(purchaseReceiptItems.receiptId, id))
        .orderBy(asc(purchaseReceiptItems.lineNo));
      const priced = priceDocument(
        items.map((i) => ({
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
        })),
        receipt.discountAmount,
      );
      const unitCosts = purchaseUnitCosts(priced);
      await this.inventory.apply(
        tx,
        {
          type: 'PURCHASE_IN',
          refType: 'PURCHASE_RECEIPT',
          refId: receipt.id,
          refCode: receipt.code,
          userId,
        },
        items.map((item, i) => ({
          productId: item.productId,
          quantity: decimal(item.quantity, QUANTITY_SCALE),
          unitCost: unitCosts[i]!,
          refItemId: item.id,
        })),
      );
      for (const [i, item] of items.entries()) {
        await tx
          .update(purchaseReceiptItems)
          .set({ unitCost: costString(unitCosts[i]!) })
          .where(eq(purchaseReceiptItems.id, item.id));
      }
    });
    return this.get(id);
  }

  /** Huỷ chỉ áp dụng cho phiếu nháp; phiếu đã xác nhận sửa sai bằng điều chỉnh tồn (spec Q1) */
  async cancel(id: string, { version, reason }: CancelInput, userId: string) {
    await this.db.transaction(async (tx) => {
      await this.lockDraft(tx, id, version);
      await tx
        .update(purchaseReceipts)
        .set({
          status: 'CANCELLED',
          cancelReason: reason ?? null,
          cancelledBy: userId,
          cancelledAt: new Date(),
          version: version + 1,
        })
        .where(eq(purchaseReceipts.id, id));
    });
    return this.get(id);
  }
}

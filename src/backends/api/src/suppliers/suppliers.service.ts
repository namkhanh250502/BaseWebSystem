import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  purchaseReceipts,
  sql,
  suppliers,
  type Supplier,
} from '@base/db';
import type {
  createSupplierSchema,
  listSuppliersQuerySchema,
  SupplierDetailDto,
  SupplierDto,
  updateSupplierSchema,
} from '@base/shared';
import { conflict, notFound, unprocessable } from '@base/server-kit';
import type { z } from 'zod';
import { InjectDb, type Database, type DbOrTx } from '../core/database';
import { containsPattern, pageMeta } from '../core/query-helpers';

type ListQuery = z.infer<typeof listSuppliersQuerySchema>;
type CreateInput = z.infer<typeof createSupplierSchema>;
type UpdateInput = z.infer<typeof updateSupplierSchema>;

function toDto(s: Supplier): SupplierDto {
  return {
    id: s.id,
    name: s.name,
    contactPerson: s.contactPerson,
    phone: s.phone,
    email: s.email,
    address: s.address,
    notes: s.notes,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

@Injectable()
export class SuppliersService {
  constructor(@InjectDb() private readonly db: Database) {}

  async findOrThrow(id: string, db: DbOrTx = this.db): Promise<Supplier> {
    const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    if (!row) throw notFound('suppliers.notFound');
    return row;
  }

  /** Nhà cung cấp dùng được cho phiếu nhập mới */
  async assertActive(id: string, db: DbOrTx = this.db): Promise<Supplier> {
    const supplier = await this.findOrThrow(id, db);
    if (supplier.status !== 'ACTIVE') throw unprocessable('suppliers.inactive');
    return supplier;
  }

  async list({ page, pageSize, search, status, sortBy, sortOrder }: ListQuery) {
    const pattern = search ? containsPattern(search) : undefined;
    const where = and(
      pattern
        ? or(
            ilike(suppliers.name, pattern),
            ilike(suppliers.contactPerson, pattern),
            ilike(suppliers.phone, pattern),
            ilike(suppliers.email, pattern),
          )
        : undefined,
      status ? eq(suppliers.status, status) : undefined,
    );
    const column = sortBy === 'name' ? suppliers.name : suppliers.createdAt;
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(suppliers)
        .where(where)
        .orderBy((sortOrder === 'asc' ? asc : desc)(column), asc(suppliers.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(suppliers).where(where),
    ]);
    return { items: rows.map(toDto), meta: pageMeta(page, pageSize, total?.value) };
  }

  /** Chi tiết kèm tóm tắt nhập hàng — chỉ tính phiếu đã xác nhận (FR-012) */
  async get(id: string): Promise<SupplierDetailDto> {
    const supplier = await this.findOrThrow(id);
    const [summary] = await this.db
      .select({
        receiptCount: sql<number>`count(*)::int`,
        totalConfirmedAmount: sql<string>`coalesce(sum(${purchaseReceipts.totalAmount}), 0)::numeric(18,2)`,
        lastReceiptDate: sql<string | null>`max(${purchaseReceipts.receiptDate})::text`,
      })
      .from(purchaseReceipts)
      .where(and(eq(purchaseReceipts.supplierId, id), eq(purchaseReceipts.status, 'CONFIRMED')));
    return {
      ...toDto(supplier),
      purchaseSummary: {
        receiptCount: summary?.receiptCount ?? 0,
        totalConfirmedAmount: summary?.totalConfirmedAmount ?? '0.00',
        lastReceiptDate: summary?.lastReceiptDate ?? null,
      },
    };
  }

  async create(input: CreateInput): Promise<SupplierDto> {
    const [row] = await this.db
      .insert(suppliers)
      .values({
        name: input.name,
        contactPerson: input.contactPerson ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        status: input.status,
      })
      .returning();
    return toDto(row!);
  }

  async update(id: string, input: UpdateInput): Promise<SupplierDto> {
    await this.findOrThrow(id);
    const values = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const [row] = Object.keys(values).length
      ? await this.db.update(suppliers).set(values).where(eq(suppliers.id, id)).returning()
      : [await this.findOrThrow(id)];
    return toDto(row!);
  }

  /** Nhà cung cấp đã có phiếu nhập (kể cả nháp) chỉ ngừng hợp tác được */
  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    const [used] = await this.db
      .select({ value: count() })
      .from(purchaseReceipts)
      .where(eq(purchaseReceipts.supplierId, id));
    if (used && used.value > 0) throw conflict('suppliers.inUse');
    await this.db.delete(suppliers).where(eq(suppliers.id, id));
  }
}

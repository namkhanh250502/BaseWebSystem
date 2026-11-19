import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  categories,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  products,
  sql,
  type Category,
} from '@base/db';
import type {
  CategoryDto,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from '@base/shared';
import { conflict, notFound } from '@base/server-kit';
import type { z } from 'zod';
import { InjectDb, type Database } from '../core/database';
import { containsPattern, pageMeta } from '../core/query-helpers';

type ListQuery = z.infer<typeof listCategoriesQuerySchema>;
type CreateInput = z.infer<typeof createCategorySchema>;
type UpdateInput = z.infer<typeof updateCategorySchema>;

@Injectable()
export class CategoriesService {
  constructor(@InjectDb() private readonly db: Database) {}

  private async toDtos(rows: Category[]): Promise<CategoryDto[]> {
    if (!rows.length) return [];
    const counts = await this.db
      .select({ categoryId: products.categoryId, value: count() })
      .from(products)
      .where(
        inArray(
          products.categoryId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(products.categoryId);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      productCount: counts.find((c) => c.categoryId === r.id)?.value ?? 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async findOrThrow(id: string): Promise<Category> {
    const [row] = await this.db.select().from(categories).where(eq(categories.id, id));
    if (!row) throw notFound('categories.notFound');
    return row;
  }

  /** Tên danh mục duy nhất, không phân biệt hoa thường */
  private async assertNameFree(name: string, exceptId?: string) {
    const [existing] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          sql`lower(${categories.name}) = lower(${name})`,
          exceptId ? ne(categories.id, exceptId) : undefined,
        ),
      );
    if (existing) throw conflict('categories.nameExists', { name });
  }

  async list({ page, pageSize, search, status, sortBy, sortOrder }: ListQuery) {
    const where = and(
      search ? ilike(categories.name, containsPattern(search)) : undefined,
      status ? eq(categories.status, status) : undefined,
    );
    const column = sortBy === 'name' ? categories.name : categories.createdAt;
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(categories)
        .where(where)
        .orderBy((sortOrder === 'asc' ? asc : desc)(column), asc(categories.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(categories).where(where),
    ]);
    return { items: await this.toDtos(rows), meta: pageMeta(page, pageSize, total?.value) };
  }

  async get(id: string): Promise<CategoryDto> {
    const [dto] = await this.toDtos([await this.findOrThrow(id)]);
    return dto!;
  }

  async create(input: CreateInput): Promise<CategoryDto> {
    await this.assertNameFree(input.name);
    const [row] = await this.db
      .insert(categories)
      .values({ name: input.name, description: input.description ?? null, status: input.status })
      .returning();
    return (await this.toDtos([row!]))[0]!;
  }

  async update(id: string, input: UpdateInput): Promise<CategoryDto> {
    await this.findOrThrow(id);
    if (input.name !== undefined) await this.assertNameFree(input.name, id);
    const [row] = await this.db
      .update(categories)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      .where(eq(categories.id, id))
      .returning();
    return (await this.toDtos([row!]))[0]!;
  }

  /** Chỉ xoá được danh mục chưa có sản phẩm (FK RESTRICT là chốt chặn cuối) */
  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    const [used] = await this.db
      .select({ value: count() })
      .from(products)
      .where(eq(products.categoryId, id));
    if (used && used.value > 0) throw conflict('categories.inUse');
    await this.db.delete(categories).where(eq(categories.id, id));
  }
}

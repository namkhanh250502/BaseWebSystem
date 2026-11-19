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
  inventoryBalances,
  ne,
  or,
  productImages,
  products,
  purchaseReceiptItems,
  salesOrderItems,
  sql,
  type Product,
  type ProductImage,
} from '@base/db';
import type {
  createProductSchema,
  listProductsQuerySchema,
  ProductDetailDto,
  ProductDto,
  updateProductSchema,
} from '@base/shared';
import {
  conflict,
  decimal,
  isInteger,
  notFound,
  QUANTITY_SCALE,
  unprocessable,
} from '@base/server-kit';
import type { z } from 'zod';
import { InjectDb, type Database, type DbOrTx } from '../core/database';
import { containsPattern, pageMeta } from '../core/query-helpers';
import { InventoryService } from '../inventory/inventory.service';
import { stockStateWhere } from '../inventory/stock-state';
import { StorageService } from '../storage/storage.service';
import {
  toProductDetailDto,
  toProductDto,
  type ImageUrlSigner,
  type ProductRow,
} from './product.mapper';

type ListQuery = z.infer<typeof listProductsQuerySchema>;
type CreateInput = z.infer<typeof createProductSchema>;
type UpdateInput = z.infer<typeof updateProductSchema>;

/** Ngữ cảnh người xem: quyết định có trả giá nhập / giá vốn hay không */
export interface ViewerContext {
  canViewCost: boolean;
}

const SORT_COLUMNS = {
  name: products.name,
  sku: products.sku,
  sellingPrice: products.sellingPrice,
  stock: inventoryBalances.quantity,
  createdAt: products.createdAt,
} as const;

@Injectable()
export class ProductsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly inventory: InventoryService,
    private readonly storage: StorageService,
  ) {}

  /** Ký trước URL xem cho các ảnh (một lần cho cả danh sách) */
  private async signerFor(images: ProductImage[]): Promise<ImageUrlSigner> {
    const signed = await this.storage.signDownloads(images.map((i) => i.objectKey));
    return (key) => signed.get(key) ?? null;
  }

  /** Truy vấn sản phẩm kèm danh mục + tồn (dùng cho danh sách và chi tiết) */
  private baseQuery(db: DbOrTx = this.db) {
    return db
      .select({
        product: products,
        category: { id: categories.id, name: categories.name },
        quantity: inventoryBalances.quantity,
        avgCost: inventoryBalances.avgCost,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .innerJoin(inventoryBalances, eq(inventoryBalances.productId, products.id));
  }

  private async readyImages(productIds: string[], primaryOnly: boolean): Promise<ProductImage[]> {
    if (!productIds.length) return [];
    return this.db
      .select()
      .from(productImages)
      .where(
        and(
          inArray(productImages.productId, productIds),
          eq(productImages.status, 'READY'),
          primaryOnly ? eq(productImages.isPrimary, true) : undefined,
        ),
      )
      .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt));
  }

  async findOrThrow(id: string, db: DbOrTx = this.db): Promise<Product> {
    const [row] = await db.select().from(products).where(eq(products.id, id));
    if (!row) throw notFound('products.notFound');
    return row;
  }

  private async assertSkuFree(sku: string, exceptId?: string) {
    const [existing] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          sql`lower(${products.sku}) = lower(${sku})`,
          exceptId ? ne(products.id, exceptId) : undefined,
        ),
      );
    if (existing) throw conflict('products.skuExists', { sku });
  }

  private async assertCategoryActive(categoryId: string) {
    const [category] = await this.db
      .select({ status: categories.status })
      .from(categories)
      .where(eq(categories.id, categoryId));
    if (!category) throw notFound('categories.notFound');
    if (category.status !== 'ACTIVE') throw unprocessable('categories.inactive');
  }

  async list(query: ListQuery, viewer: ViewerContext) {
    const { page, pageSize, search, categoryId, status, stockState, sortBy, sortOrder } = query;
    const where = and(
      search
        ? or(
            ilike(products.name, containsPattern(search)),
            ilike(products.sku, containsPattern(search)),
          )
        : undefined,
      categoryId ? eq(products.categoryId, categoryId) : undefined,
      status ? eq(products.status, status) : undefined,
      stockState ? stockStateWhere(stockState) : undefined,
    );
    const order = sortOrder === 'asc' ? asc : desc;
    const [rows, [total]] = await Promise.all([
      this.baseQuery()
        .where(where)
        .orderBy(order(SORT_COLUMNS[sortBy]), asc(products.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(products)
        .innerJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
        .where(where),
    ]);
    const images = await this.readyImages(
      rows.map((r) => r.product.id),
      true,
    );
    const signUrl = await this.signerFor(images);
    const items: ProductDto[] = rows.map((row) =>
      toProductDto(
        row,
        images.find((i) => i.productId === row.product.id),
        { canViewCost: viewer.canViewCost, signUrl },
      ),
    );
    return { items, meta: pageMeta(page, pageSize, total?.value) };
  }

  async get(id: string, viewer: ViewerContext): Promise<ProductDetailDto> {
    const [row] = await this.baseQuery().where(eq(products.id, id));
    if (!row) throw notFound('products.notFound');
    return this.toDetail(row, viewer);
  }

  private async toDetail(row: ProductRow, viewer: ViewerContext): Promise<ProductDetailDto> {
    const images = await this.readyImages([row.product.id], false);
    return toProductDetailDto(row, images, {
      canViewCost: viewer.canViewCost,
      signUrl: await this.signerFor(images),
    });
  }

  async create(
    input: CreateInput,
    userId: string,
    viewer: ViewerContext,
  ): Promise<ProductDetailDto> {
    await this.assertSkuFree(input.sku);
    await this.assertCategoryActive(input.categoryId);
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(products)
        .values({
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          categoryId: input.categoryId,
          unit: input.unit,
          allowDecimalQuantity: input.allowDecimalQuantity,
          purchasePrice: input.purchasePrice,
          sellingPrice: input.sellingPrice,
          minStock: input.minStock,
          status: input.status,
          createdBy: userId,
        })
        .returning({ id: products.id });
      await this.inventory.initBalance(tx, row!.id);
      return row!.id;
    });
    return this.get(id, viewer);
  }

  async update(id: string, input: UpdateInput, viewer: ViewerContext): Promise<ProductDetailDto> {
    const current = await this.findOrThrow(id);
    if (input.sku !== undefined) await this.assertSkuFree(input.sku, id);
    if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
      await this.assertCategoryActive(input.categoryId);
    }
    if (input.allowDecimalQuantity === false && current.allowDecimalQuantity) {
      const balances = await this.inventory.getBalances(this.db, [id]);
      const quantity = balances.get(id)?.quantity ?? '0';
      if (!isInteger(decimal(quantity, QUANTITY_SCALE))) {
        throw conflict('products.decimalQuantityLocked');
      }
    }
    const values = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    ) as Partial<typeof products.$inferInsert>;
    if (Object.keys(values).length) {
      await this.db.update(products).set(values).where(eq(products.id, id));
    }
    return this.get(id, viewer);
  }

  /** Sản phẩm có trong chứng từ (kể cả nháp) — FK RESTRICT sẽ chặn xoá */
  private async isUsedInDocuments(productId: string): Promise<boolean> {
    const result = await this.db.execute(sql`
      select 1 from ${purchaseReceiptItems} where ${purchaseReceiptItems.productId} = ${productId}
      union all
      select 1 from ${salesOrderItems} where ${salesOrderItems.productId} = ${productId}
      limit 1`);
    return result.rows.length > 0;
  }

  /**
   * Xoá cứng chỉ khi chưa phát sinh chứng từ (FR-004). Object ảnh được xoá sau khi commit;
   * object nào xoá lỗi sẽ được dọn bởi StorageCleanupService.
   */
  async remove(id: string): Promise<void> {
    const product = await this.findOrThrow(id);
    if (product.hasTransactions || (await this.isUsedInDocuments(id))) {
      throw conflict('products.hasTransactions');
    }
    const keys = await this.db
      .select({ key: productImages.objectKey })
      .from(productImages)
      .where(eq(productImages.productId, id));
    await this.db.delete(products).where(eq(products.id, id));
    await this.storage.removeMany(keys.map((k) => k.key));
  }
}

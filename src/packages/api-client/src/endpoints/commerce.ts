import type {
  CancelDocumentInput,
  CategoryDto,
  ConfirmSalesOrderInput,
  CreateAdjustmentInput,
  CreateCategoryInput,
  CreateProductInput,
  CreateSalesOrderInput,
  CreateSupplierInput,
  ImageMimeType,
  ImageUploadTicket,
  InventoryAdjustmentDetailDto,
  InventoryAdjustmentDto,
  InventoryItemDto,
  InventoryMovementDto,
  InventoryReportRow,
  InventorySummary,
  ListAdjustmentsQuery,
  ListCategoriesQuery,
  ListInventoryQuery,
  ListMovementsQuery,
  ListProductsQuery,
  ListPurchasesQuery,
  ListSalesOrdersQuery,
  ListSuppliersQuery,
  PaySalesOrderInput,
  ProductDetailDto,
  ProductDto,
  ProductImageDto,
  ProductSalesRow,
  ProfitReport,
  PurchaseInput,
  PurchaseReceiptDetailDto,
  PurchaseReceiptDto,
  PurchaseReport,
  ReportPagedQuery,
  ReportRangeQuery,
  SalesByProductQuery,
  SalesOrderDetailDto,
  SalesOrderDto,
  SalesPeriodReport,
  SupplierDetailDto,
  SupplierDto,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdatePurchaseInput,
  UpdateSalesOrderInput,
  UpdateSupplierInput,
} from '@base/shared';
import { ApiClientError, toPaginated, type HttpClient } from '../http';

export function createCategoriesApi(http: HttpClient) {
  return {
    list: async (query: ListCategoriesQuery = {}) =>
      toPaginated(await http.get<CategoryDto[]>('/categories', { query })),
    get: async (id: string) => (await http.get<CategoryDto>(`/categories/${id}`)).data,
    create: async (input: CreateCategoryInput) =>
      (await http.post<CategoryDto>('/categories', input)).data,
    update: async (id: string, input: UpdateCategoryInput) =>
      (await http.patch<CategoryDto>(`/categories/${id}`, input)).data,
    remove: async (id: string) => {
      await http.delete(`/categories/${id}`);
    },
  };
}

/**
 * Tải file lên MinIO bằng form POST đã ký (không gửi access token của API). MinIO trả 204;
 * lỗi (quá dung lượng, sai loại, hết hạn) → ApiClientError key `productImages.uploadFailed`.
 */
async function postToStorage(ticket: ImageUploadTicket, file: Blob, signal?: AbortSignal) {
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.upload.fields)) form.append(key, value);
  form.append('file', file);
  let res: Response;
  try {
    res = await fetch(ticket.upload.url, { method: 'POST', body: form, signal });
  } catch {
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Upload failed', 'productImages.uploadFailed');
  }
  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      'UPLOAD_FAILED',
      `HTTP ${res.status}`,
      'productImages.uploadFailed',
    );
  }
}

export function createProductsApi(http: HttpClient) {
  const images = {
    requestUpload: async (
      productId: string,
      input: {
        fileName: string;
        mimeType: ImageMimeType;
        sizeBytes: number;
        replaceImageId?: string;
      },
    ) =>
      (await http.post<ImageUploadTicket>(`/products/${productId}/images/upload-requests`, input))
        .data,
    complete: async (productId: string, imageId: string) =>
      (await http.post<ProductImageDto>(`/products/${productId}/images/${imageId}/complete`)).data,
    setPrimary: async (productId: string, imageId: string) =>
      (
        await http.patch<ProductImageDto[]>(`/products/${productId}/images/${imageId}`, {
          isPrimary: true,
        })
      ).data,
    reorder: async (productId: string, imageIds: string[]) =>
      (await http.put<ProductImageDto[]>(`/products/${productId}/images/order`, { imageIds })).data,
    remove: async (productId: string, imageId: string) => {
      await http.delete(`/products/${productId}/images/${imageId}`);
    },
    /** Đủ 3 bước: xin form ký sẵn → tải thẳng lên MinIO → báo hoàn tất để server kiểm tra */
    upload: async (
      productId: string,
      file: File,
      options: { replaceImageId?: string; signal?: AbortSignal } = {},
    ) => {
      const ticket = await images.requestUpload(productId, {
        fileName: file.name,
        mimeType: file.type as ImageMimeType,
        sizeBytes: file.size,
        replaceImageId: options.replaceImageId,
      });
      await postToStorage(ticket, file, options.signal);
      return images.complete(productId, ticket.imageId);
    },
  };
  return {
    list: async (query: ListProductsQuery = {}) =>
      toPaginated(await http.get<ProductDto[]>('/products', { query })),
    get: async (id: string) => (await http.get<ProductDetailDto>(`/products/${id}`)).data,
    create: async (input: CreateProductInput) =>
      (await http.post<ProductDetailDto>('/products', input)).data,
    update: async (id: string, input: UpdateProductInput) =>
      (await http.patch<ProductDetailDto>(`/products/${id}`, input)).data,
    remove: async (id: string) => {
      await http.delete(`/products/${id}`);
    },
    images,
  };
}

export function createSuppliersApi(http: HttpClient) {
  return {
    list: async (query: ListSuppliersQuery = {}) =>
      toPaginated(await http.get<SupplierDto[]>('/suppliers', { query })),
    get: async (id: string) => (await http.get<SupplierDetailDto>(`/suppliers/${id}`)).data,
    create: async (input: CreateSupplierInput) =>
      (await http.post<SupplierDto>('/suppliers', input)).data,
    update: async (id: string, input: UpdateSupplierInput) =>
      (await http.patch<SupplierDto>(`/suppliers/${id}`, input)).data,
    remove: async (id: string) => {
      await http.delete(`/suppliers/${id}`);
    },
  };
}

export function createPurchasesApi(http: HttpClient) {
  return {
    list: async (query: ListPurchasesQuery = {}) =>
      toPaginated(await http.get<PurchaseReceiptDto[]>('/purchases', { query })),
    get: async (id: string) => (await http.get<PurchaseReceiptDetailDto>(`/purchases/${id}`)).data,
    create: async (input: PurchaseInput) =>
      (await http.post<PurchaseReceiptDetailDto>('/purchases', input)).data,
    update: async (id: string, input: UpdatePurchaseInput) =>
      (await http.patch<PurchaseReceiptDetailDto>(`/purchases/${id}`, input)).data,
    confirm: async (id: string, version: number) =>
      (await http.post<PurchaseReceiptDetailDto>(`/purchases/${id}/confirm`, { version })).data,
    cancel: async (id: string, input: CancelDocumentInput) =>
      (await http.post<PurchaseReceiptDetailDto>(`/purchases/${id}/cancel`, input)).data,
  };
}

export function createSalesOrdersApi(http: HttpClient) {
  return {
    list: async (query: ListSalesOrdersQuery = {}) =>
      toPaginated(await http.get<SalesOrderDto[]>('/sales-orders', { query })),
    get: async (id: string) => (await http.get<SalesOrderDetailDto>(`/sales-orders/${id}`)).data,
    /** Idempotent theo `clientRequestId`: gửi lại trả về đơn đã tạo */
    create: async (input: CreateSalesOrderInput) =>
      (await http.post<SalesOrderDetailDto>('/sales-orders', input)).data,
    update: async (id: string, input: UpdateSalesOrderInput) =>
      (await http.patch<SalesOrderDetailDto>(`/sales-orders/${id}`, input)).data,
    confirm: async (id: string, input: ConfirmSalesOrderInput) =>
      (await http.post<SalesOrderDetailDto>(`/sales-orders/${id}/confirm`, input)).data,
    pay: async (id: string, input: PaySalesOrderInput = {}) =>
      (await http.post<SalesOrderDetailDto>(`/sales-orders/${id}/pay`, input)).data,
    cancel: async (id: string, input: CancelDocumentInput) =>
      (await http.post<SalesOrderDetailDto>(`/sales-orders/${id}/cancel`, input)).data,
  };
}

export function createInventoryApi(http: HttpClient) {
  return {
    list: async (query: ListInventoryQuery = {}) =>
      toPaginated(await http.get<InventoryItemDto[]>('/inventory', { query })),
    summary: async (query: ListInventoryQuery = {}) =>
      (await http.get<InventorySummary>('/inventory/summary', { query })).data,
    movements: async (query: ListMovementsQuery = {}) =>
      toPaginated(await http.get<InventoryMovementDto[]>('/inventory/movements', { query })),
    adjustments: async (query: ListAdjustmentsQuery = {}) =>
      toPaginated(await http.get<InventoryAdjustmentDto[]>('/inventory/adjustments', { query })),
    adjustment: async (id: string) =>
      (await http.get<InventoryAdjustmentDetailDto>(`/inventory/adjustments/${id}`)).data,
    /** Idempotent theo `clientRequestId` */
    adjust: async (input: CreateAdjustmentInput) =>
      (await http.post<InventoryAdjustmentDetailDto>('/inventory/adjustments', input)).data,
  };
}

export function createReportsApi(http: HttpClient) {
  return {
    salesDaily: async (query: ReportRangeQuery) =>
      (await http.get<SalesPeriodReport>('/reports/sales/daily', { query })).data,
    salesMonthly: async (query: ReportRangeQuery) =>
      (await http.get<SalesPeriodReport>('/reports/sales/monthly', { query })).data,
    salesByProduct: async (query: SalesByProductQuery) =>
      toPaginated(await http.get<ProductSalesRow[]>('/reports/sales/by-product', { query })),
    profit: async (query: ReportRangeQuery) =>
      (await http.get<ProfitReport>('/reports/profit', { query })).data,
    purchases: async (query: ReportRangeQuery) =>
      (await http.get<PurchaseReport>('/reports/purchases', { query })).data,
    inventory: async (query: ReportPagedQuery) =>
      toPaginated(await http.get<InventoryReportRow[]>('/reports/inventory', { query })),
    inventoryMovements: async (query: ReportPagedQuery) =>
      toPaginated(
        await http.get<InventoryMovementDto[]>('/reports/inventory-movements', { query }),
      ),
  };
}

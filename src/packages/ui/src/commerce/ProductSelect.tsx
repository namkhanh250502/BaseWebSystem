import type { ProductDto } from '@base/shared';
import { useQuery } from '@tanstack/react-query';
import { Select, Space, Typography, type SelectProps } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../hooks';
import { useApi } from '../providers/ApiContext';
import { ProductThumb } from './ProductThumb';
import { StockStateTag } from './StatusTags';
import { useCommerceFormat } from './useCommerceFormat';

export interface ProductSelectProps extends Omit<
  SelectProps<string>,
  'options' | 'onSearch' | 'filterOption' | 'onChange'
> {
  /** Chỉ sản phẩm đang kinh doanh (mặc định true) */
  activeOnly?: boolean;
  /** Nhãn cho giá trị đang chọn khi nó không nằm trong kết quả tìm kiếm (form sửa) */
  initialOption?: { id: string; label: string };
  onChange?: (productId: string, product: ProductDto) => void;
}

/** Ô chọn sản phẩm tìm theo tên / SKU (gọi API, debounce), hiện ảnh, giá bán, tồn */
export function ProductSelect({
  activeOnly = true,
  initialOption,
  onChange,
  ...props
}: ProductSelectProps) {
  const { t } = useTranslation('commerce');
  const api = useApi();
  const format = useCommerceFormat();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 300);
  const products = useQuery({
    queryKey: ['products', 'select', debounced, activeOnly],
    queryFn: () =>
      api.products.list({
        search: debounced || undefined,
        status: activeOnly ? 'ACTIVE' : undefined,
        pageSize: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    staleTime: 30_000,
  });
  const items = products.data?.items ?? [];
  return (
    <Select<string>
      showSearch
      filterOption={false}
      placeholder={t('productSearchPlaceholder')}
      notFoundContent={products.isFetching ? t('common:loading') : t('noProducts')}
      loading={products.isFetching}
      onSearch={setSearch}
      onChange={(id) => {
        const product = items.find((p) => p.id === id);
        if (product) onChange?.(id, product);
        setSearch('');
      }}
      options={[
        ...(initialOption && !items.some((p) => p.id === initialOption.id)
          ? [{ value: initialOption.id, label: initialOption.label, product: undefined }]
          : []),
        ...items.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}`, product: p })),
      ]}
      optionRender={(option) => {
        const p = (option.data as { product?: ProductDto }).product;
        if (!p) return option.label;
        return (
          <Space>
            <ProductThumb url={p.primaryImage?.url} alt={p.name} size={28} />
            <span>
              <Typography.Text strong>{p.sku}</Typography.Text> {p.name}
              <br />
              <Typography.Text type="secondary">
                {format.money(p.sellingPrice)} · {t('stock')}: {format.quantity(p.stock.quantity)}
              </Typography.Text>
            </span>
            <StockStateTag state={p.stock.state} />
          </Space>
        );
      }}
      {...props}
    />
  );
}

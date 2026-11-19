import type { SelectProps } from 'antd';
import { useApi } from '@base/ui';
import { useQuery } from '@tanstack/react-query';
import { Select } from 'antd';

/** Chọn danh mục (tải tối đa 100 danh mục, sắp theo tên); `activeOnly` cho form tạo / sửa */
export function CategorySelect({
  activeOnly = false,
  ...props
}: SelectProps<string> & { activeOnly?: boolean }) {
  const api = useApi();
  const categories = useQuery({
    queryKey: ['categories', 'options', activeOnly],
    queryFn: () =>
      api.categories.list({
        pageSize: 100,
        sortBy: 'name',
        sortOrder: 'asc',
        status: activeOnly ? 'ACTIVE' : undefined,
      }),
    staleTime: 60_000,
  });
  return (
    <Select<string>
      showSearch
      optionFilterProp="label"
      loading={categories.isFetching}
      options={(categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
      {...props}
    />
  );
}

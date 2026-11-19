import { useApi, useDebouncedValue } from '@base/ui';
import { useQuery } from '@tanstack/react-query';
import { Select, type SelectProps } from 'antd';
import { useState } from 'react';

/** Chọn nhà cung cấp (tìm theo tên / SĐT); `activeOnly` cho phiếu nhập mới */
export function SupplierSelect({
  activeOnly = false,
  extraOption,
  ...props
}: SelectProps<string> & { activeOnly?: boolean; extraOption?: { id: string; name: string } }) {
  const api = useApi();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 300);
  const suppliers = useQuery({
    queryKey: ['suppliers', 'options', debounced, activeOnly],
    queryFn: () =>
      api.suppliers.list({
        search: debounced || undefined,
        status: activeOnly ? 'ACTIVE' : undefined,
        pageSize: 30,
      }),
    staleTime: 30_000,
  });
  const options = (suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }));
  if (extraOption && !options.some((o) => o.value === extraOption.id)) {
    options.unshift({ value: extraOption.id, label: extraOption.name });
  }
  return (
    <Select<string>
      showSearch
      filterOption={false}
      onSearch={setSearch}
      loading={suppliers.isFetching}
      options={options}
      {...props}
    />
  );
}

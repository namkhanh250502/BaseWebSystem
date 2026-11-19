import { useApi } from '@base/ui';
import { useQuery } from '@tanstack/react-query';

/** Cài đặt công khai: tên site, cho phép đăng ký, site key captcha */
export function usePublicSettings() {
  const api = useApi();
  return useQuery({
    queryKey: ['settings', 'public'],
    queryFn: () => api.settings.public(),
    staleTime: 5 * 60 * 1000,
  });
}

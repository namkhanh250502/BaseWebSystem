import type { ListNotificationsQuery } from '@base/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../providers/ApiContext';

const NOTIFICATIONS_KEY = ['notifications'] as const;
/** Tần suất kiểm tra thông báo mới (chỉ khi tab đang mở) */
const POLL_INTERVAL_MS = 60 * 1000;

/** Số thông báo chưa đọc của tài khoản đang đăng nhập (tự làm mới định kỳ) */
export function useUnreadCount() {
  const api = useApi();
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'unread-count'],
    queryFn: () => api.me.notifications.unreadCount(),
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/** Danh sách thông báo phân trang; `enabled = false` để chỉ tải khi mở popover */
export function useNotificationList(query: ListNotificationsQuery, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'list', query],
    queryFn: () => api.me.notifications.list(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Đánh dấu đã đọc rồi làm mới mọi query thông báo */
export function useMarkNotifications() {
  const api = useApi();
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  return {
    markRead: useMutation({ mutationFn: (ids: string[]) => api.me.notifications.markRead(ids), onSuccess }),
    markAllRead: useMutation({ mutationFn: () => api.me.notifications.markAllRead(), onSuccess }),
  };
}

/** Mở link của thông báo: URL tuyệt đối mở tab mới, đường dẫn nội bộ thì điều hướng trong app */
export function openNotificationLink(link: string, navigate: (path: string) => void) {
  if (/^https?:\/\//.test(link)) window.open(link, '_blank', 'noopener');
  else navigate(link);
}

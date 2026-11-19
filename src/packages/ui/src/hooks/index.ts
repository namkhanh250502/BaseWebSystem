import { App } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage, isConnectivityError } from '../utils';

/** Key toast dùng chung cho mọi lỗi mất kết nối → antd thay toast cũ thay vì chồng thêm */
const CONNECTIVITY_MESSAGE_KEY = 'api-connectivity-error';

/**
 * Hiện toast lỗi cho một request thất bại.
 * Gộp theo `key`: backend down làm N request cùng lỗi thì chỉ còn 1 toast "Không kết nối được tới máy chủ";
 * lỗi nghiệp vụ trùng nội dung cũng không hiện lặp.
 */
export function useNotifyError() {
  const { message } = App.useApp();
  const { t } = useTranslation('common');
  return useCallback(
    (error: unknown) => {
      const content = getErrorMessage(error, t);
      const key = isConnectivityError(error) ? CONNECTIVITY_MESSAGE_KEY : `api-error:${content}`;
      void message.error({ key, content });
    },
    [message, t],
  );
}

/** true khi màn hình hẹp hơn `breakpoint` */
export function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setIsMobile(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return isMobile;
}

export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

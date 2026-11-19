import { useTranslation } from 'react-i18next';
import { formatMoney, formatPercent, formatQuantity } from './format';

/** Hàm định dạng gắn với ngôn ngữ hiện tại (tự đổi khi người dùng chuyển ngôn ngữ) */
export function useCommerceFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  return {
    money: (value: string | number | null | undefined) => formatMoney(value, locale),
    quantity: (value: string | number | null | undefined) => formatQuantity(value, locale),
    percent: (value: string | null | undefined) => formatPercent(value, locale),
  };
}

import type {
  AdjustmentReason,
  DocumentStatus,
  MovementType,
  PaymentStatus,
  StockState,
} from '@base/shared';
import { Badge, Tag } from 'antd';
import { useTranslation } from 'react-i18next';

/* Nhãn trạng thái: tra bản dịch theo MÃ (commerce:<nhóm>.<mã>), không lưu chuỗi dịch vào dữ liệu */

const DOCUMENT_COLORS: Record<DocumentStatus, string> = {
  DRAFT: 'default',
  CONFIRMED: 'green',
  CANCELLED: 'red',
};

export function DocumentStatusTag({ status }: { status: DocumentStatus }) {
  const { t } = useTranslation('commerce');
  return <Tag color={DOCUMENT_COLORS[status]}>{t(`documentStatus.${status}`)}</Tag>;
}

export function PaymentStatusTag({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation('commerce');
  return (
    <Badge status={status === 'PAID' ? 'success' : 'warning'} text={t(`paymentStatus.${status}`)} />
  );
}

const STOCK_COLORS: Record<StockState, string> = { IN_STOCK: 'green', LOW: 'orange', OUT: 'red' };

export function StockStateTag({ state }: { state: StockState }) {
  const { t } = useTranslation('commerce');
  return <Tag color={STOCK_COLORS[state]}>{t(`stockState.${state}`)}</Tag>;
}

const MOVEMENT_COLORS: Record<MovementType, string> = {
  PURCHASE_IN: 'blue',
  SALE_OUT: 'purple',
  SALE_CANCEL_IN: 'cyan',
  ADJUSTMENT_IN: 'green',
  ADJUSTMENT_OUT: 'orange',
};

export function MovementTypeTag({ type }: { type: MovementType }) {
  const { t } = useTranslation('commerce');
  return <Tag color={MOVEMENT_COLORS[type]}>{t(`movementType.${type}`)}</Tag>;
}

export function AdjustmentReasonTag({ reason }: { reason: AdjustmentReason }) {
  const { t } = useTranslation('commerce');
  return <Tag>{t(`adjustmentReason.${reason}`)}</Tag>;
}

import {
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  InfoCircleFilled,
} from '@ant-design/icons';
import type { NotificationDto, NotificationType } from '@base/shared';
import { Tag, Tooltip, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { formatDateTime, fromNow } from '../utils';

const ICONS: Record<NotificationType, React.ReactNode> = {
  info: <InfoCircleFilled />,
  success: <CheckCircleFilled />,
  warning: <ExclamationCircleFilled />,
  error: <CloseCircleFilled />,
};

/** 1 dòng thông báo: icon theo loại, tiêu đề (đậm khi chưa đọc), nội dung, thời gian */
export function NotificationItem({
  notification: n,
  onClick,
  compact = false,
}: {
  notification: NotificationDto;
  onClick?: (n: NotificationDto) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation('notifications');
  return (
    <button
      type="button"
      className={`noti-item${n.read ? '' : ' noti-item--unread'}${compact ? ' noti-item--compact' : ''}`}
      onClick={() => onClick?.(n)}
    >
      <span className={`noti-item__icon noti-item__icon--${n.read ? 'read' : n.type}`}>{ICONS[n.type]}</span>
      <span className="noti-item__body">
        <span className="noti-item__title-row">
          <Typography.Text strong={!n.read} className="noti-item__title">
            {n.title}
          </Typography.Text>
          {n.isGlobal && <Tag color="blue">{t('system')}</Tag>}
        </span>
        {n.message && (
          <Typography.Paragraph
            type="secondary"
            className="noti-item__message"
            ellipsis={compact ? { rows: 2 } : false}
          >
            {n.message}
          </Typography.Paragraph>
        )}
        <Tooltip title={formatDateTime(n.createdAt)}>
          <Typography.Text type="secondary" className="noti-item__time">
            {fromNow(n.createdAt)}
          </Typography.Text>
        </Tooltip>
      </span>
      {!n.read && <span className="noti-item__dot" aria-label={t('markRead')} />}
    </button>
  );
}

import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import type { NotificationDto } from '@base/shared';
import { App, Badge, Button, Popover, Segmented, Spin, Tooltip, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { cx } from '../utils';
import { NotificationItem } from './NotificationItem';
import {
  openNotificationLink,
  useMarkNotifications,
  useNotificationList,
  useUnreadCount,
} from './useNotifications';

export interface NotificationBellProps {
  /** Đường dẫn trang danh sách đầy đủ */
  listPath?: string;
}

/**
 * Chuông thông báo trên header: badge số chưa đọc, chuông rung khi có thông báo mới,
 * popover 10 thông báo mới nhất (lọc Tất cả / Chưa đọc).
 */
export function NotificationBell({ listPath = '/notifications' }: NotificationBellProps) {
  const { t } = useTranslation(['notifications', 'common']);
  const navigate = useNavigate();
  const { notification } = App.useApp();
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [ringing, setRinging] = useState(false);
  const unread = useUnreadCount();
  const list = useNotificationList({ page: 1, pageSize: 10, unreadOnly }, open);
  const { markRead, markAllRead } = useMarkNotifications();
  const count = unread.data ?? 0;

  // Có thông báo mới trong lúc đang dùng app → rung chuông + hiện toast
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (unread.data === undefined) return;
    const increased = previous.current !== null && unread.data > previous.current;
    previous.current = unread.data;
    if (!increased) return;
    notification.info({
      key: 'new-notifications',
      title: t('newTitle'),
      description: t('newDescription', { count: unread.data }),
      icon: <BellOutlined />,
      placement: 'bottomRight',
      onClick: () => navigate(listPath),
    });
    // Bật hiệu ứng trong callback hẹn giờ để không setState đồng bộ trong effect
    const start = window.setTimeout(() => setRinging(true), 0);
    const stop = window.setTimeout(() => setRinging(false), 1200);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [unread.data, notification, navigate, t, listPath]);

  const goToList = () => {
    setOpen(false);
    navigate(listPath);
  };

  const handleClick = (n: NotificationDto) => {
    if (!n.read) markRead.mutate([n.id]);
    if (n.link) {
      setOpen(false);
      openNotificationLink(n.link, navigate);
    }
  };

  const items = list.data?.items ?? [];

  const content = (
    <div className="noti-panel">
      <div className="noti-panel__header">
        <div className="noti-panel__heading">
          <Typography.Text strong className="noti-panel__title">
            {t('title')}
          </Typography.Text>
          {count > 0 && <span className="noti-panel__count">{count > 99 ? '99+' : count}</span>}
        </div>
        <Tooltip title={t('markAllRead')}>
          <Button
            type="text"
            size="small"
            icon={<CheckOutlined />}
            aria-label={t('markAllRead')}
            disabled={count === 0}
            loading={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          />
        </Tooltip>
      </div>
      <div className="noti-panel__filter">
        <Segmented
          size="small"
          block
          value={unreadOnly ? 'unread' : 'all'}
          onChange={(v) => setUnreadOnly(v === 'unread')}
          options={[
            { value: 'all', label: t('common:all') },
            { value: 'unread', label: t('unreadOnly') },
          ]}
        />
      </div>
      <div className="noti-panel__list">
        {list.isPending ? (
          <div className="noti-panel__state">
            <Spin />
          </div>
        ) : items.length ? (
          items.map((n) => <NotificationItem key={n.id} notification={n} onClick={handleClick} compact />)
        ) : (
          <div className="noti-panel__state">
            <span className="noti-panel__empty-icon">
              <BellOutlined />
            </span>
            <Typography.Text type="secondary">{unreadOnly ? t('allRead') : t('empty')}</Typography.Text>
          </div>
        )}
      </div>
      <button type="button" className="noti-panel__footer" onClick={goToList}>
        {t('viewAll')}
      </button>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      arrow={false}
      classNames={{ root: 'noti-popover' }}
    >
      <button
        type="button"
        className={cx('b-icon-btn', 'noti-bell', open && 'noti-bell--open')}
        aria-label={count ? `${t('title')} (${t('unreadCount', { count })})` : t('title')}
      >
        <Badge count={count} size="small" overflowCount={99} offset={[-2, 2]}>
          <BellOutlined className={cx('noti-bell__icon', ringing && 'noti-bell__icon--ring')} />
        </Badge>
      </button>
    </Popover>
  );
}

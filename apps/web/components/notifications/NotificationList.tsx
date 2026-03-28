'use client';

import { memo, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { Notification } from '@/types/notification';
import { NotificationItem } from './NotificationItem';
import { NotificationEmptyState } from './NotificationEmptyState';
import { NotificationSkeleton } from './NotificationSkeleton';
import { groupNotificationsByDate } from '@/utils/notification-helpers';

type TranslateFunction = (key: string, params?: Record<string, string>) => string;

type NotificationListProps = {
  notifications: Notification[];
  isLoading: boolean;
  hasMore: boolean;
  onFetchMore: () => void;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClick: (notification: Notification) => void;
  formatTimeAgo: (date: Date | string | null) => string;
  t: TranslateFunction;
  searchQuery?: string;
  compact?: boolean;
  grouped?: boolean;
};

export const NotificationList = memo(function NotificationList({
  notifications,
  isLoading,
  hasMore,
  onFetchMore,
  onMarkAsRead,
  onDelete,
  onClick,
  formatTimeAgo,
  t,
  searchQuery = '',
  compact = false,
  grouped = true,
}: NotificationListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || isLoading || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onFetchMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, onFetchMore]);

  const groupLabels = useMemo(() => ({
    today: t('groups.today'),
    yesterday: t('groups.yesterday'),
    thisWeek: t('groups.thisWeek'),
    thisMonth: t('groups.thisMonth'),
    older: t('groups.older'),
  }), [t]);

  if (isLoading && notifications.length === 0) {
    return <NotificationSkeleton count={compact ? 3 : 5} />;
  }

  if (notifications.length === 0) {
    return (
      <NotificationEmptyState
        isSearching={!!searchQuery}
        title={searchQuery ? t('noResults') : t('empty.title')}
        description={searchQuery ? t('empty.tryDifferentSearch') : t('empty.description')}
      />
    );
  }

  if (!grouped) {
    return (
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {notifications.map((notification, index) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkAsRead={onMarkAsRead}
              onDelete={onDelete}
              onClick={onClick}
              formatTimeAgo={formatTimeAgo}
              t={t}
              compact={compact}
              index={index}
            />
          ))}
        </AnimatePresence>
        {hasMore && <div ref={sentinelRef} className="h-4" />}
        {isLoading && <NotificationSkeleton count={2} />}
      </div>
    );
  }

  const groups = groupNotificationsByDate(notifications, groupLabels);

  let globalIndex = 0;

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 px-1">
            {group.label}
          </h3>
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {group.notifications.map((notification) => {
                const idx = globalIndex++;
                return (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={onMarkAsRead}
                    onDelete={onDelete}
                    onClick={onClick}
                    formatTimeAgo={formatTimeAgo}
                    t={t}
                    compact={compact}
                    index={idx}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      ))}
      {hasMore && <div ref={sentinelRef} className="h-4" />}
      {isLoading && <NotificationSkeleton count={2} />}
    </div>
  );
});

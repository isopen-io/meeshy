'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Check, Settings, ArrowRight } from 'lucide-react';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';
import { useI18n } from '@/hooks/use-i18n';
import { NotificationItem } from './NotificationItem';
import { NotificationSkeleton } from './NotificationSkeleton';
import { NotificationEmptyState } from './NotificationEmptyState';
import { UnreadBadge } from './UnreadBadge';
import { formatNotificationTimeAgo } from '@/utils/notification-helpers';
import type { Notification } from '@/types/notification';

const DROPDOWN_LIMIT = 5;

type NotificationDropdownProps = {
  className?: string;
};

export function NotificationDropdown({ className = '' }: NotificationDropdownProps) {
  const [open, setOpen] = useState(false);
  const { t, locale } = useI18n('notifications');
  const router = useRouter();

  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotificationsManagerRQ();

  const recentNotifications = notifications.slice(0, DROPDOWN_LIMIT);

  // Activation = marquage lu + fermeture. La navigation est portée par le lien interne de la rangée.
  const handleNotificationClick = useCallback((_notification: Notification) => {
    markAsRead(_notification.id);
    setOpen(false);
  }, [markAsRead]);

  const formatTimeAgo = useCallback(
    (timestamp: Date | string | null) => formatNotificationTimeAgo(timestamp, t, locale),
    [t, locale]
  );

  const ariaLabel = `Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`relative focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${className}`}
          aria-label={ariaLabel}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          <UnreadBadge count={unreadCount} />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0" sideOffset={8}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">{t('title')}</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => markAllAsRead()}
              >
                <Check className="mr-1 h-3 w-3" />
                {t('markAllRead')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setOpen(false);
                router.push('/settings?tab=notifications');
              }}
              aria-label={t('settings')}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-[24rem]">
          {isLoading && recentNotifications.length === 0 ? (
            <div className="p-2">
              <NotificationSkeleton count={3} />
            </div>
          ) : recentNotifications.length === 0 ? (
            <div className="py-8">
              <NotificationEmptyState
                isSearching={false}
                title={t('empty.title')}
                description={t('empty.description')}
              />
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {recentNotifications.map((notification, index) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                  onDelete={deleteNotification}
                  onClick={handleNotificationClick}
                  formatTimeAgo={formatTimeAgo}
                  t={t}
                  locale={locale}
                  compact
                  index={index}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
              asChild
              onClick={() => setOpen(false)}
            >
              <Link href="/notifications">
                {t('viewAll')}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

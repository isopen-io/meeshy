'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Check, Settings, ArrowRight } from 'lucide-react';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';
import { useI18n } from '@/hooks/use-i18n';
import { NotificationItem } from './NotificationItem';
import { NotificationSkeleton } from './NotificationSkeleton';
import { NotificationEmptyState } from './NotificationEmptyState';
import type { Notification } from '@/types/notification';

const DROPDOWN_LIMIT = 5;

type NotificationDropdownProps = {
  className?: string;
};

export function NotificationDropdown({ className = '' }: NotificationDropdownProps) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n('notifications');
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

  const handleNotificationClick = useCallback((notification: Notification) => {
    markAsRead(notification.id);
    setOpen(false);

    if (notification.context?.conversationId) {
      const url = notification.context?.messageId
        ? `/conversations/${notification.context.conversationId}?messageId=${notification.context.messageId}`
        : `/conversations/${notification.context.conversationId}`;
      router.push(url);
    }
  }, [markAsRead, router]);

  const formatTimeAgo = (timestamp: Date | string | null): string => {
    if (!timestamp) return '';

    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffMinutes < 1) return t('timeAgo.now');
    if (diffMinutes < 60) return t('timeAgo.minute').replace('{count}', diffMinutes.toString());

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return t('timeAgo.hour').replace('{count}', diffHours.toString());

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t('timeAgo.day').replace('{count}', diffDays.toString());

    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

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
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs flex items-center justify-center"
              aria-hidden="true"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-96 p-0"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">{t('title')}</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => markAllAsRead()}
              >
                <Check className="h-3 w-3 mr-1" />
                {t('markAllRead')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
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
          <div className="p-2">
            {isLoading && recentNotifications.length === 0 ? (
              <NotificationSkeleton count={3} />
            ) : recentNotifications.length === 0 ? (
              <div className="py-8">
                <NotificationEmptyState
                  isSearching={false}
                  title={t('empty.title')}
                  description={t('empty.description')}
                />
              </div>
            ) : (
              <div className="space-y-1">
                {recentNotifications.map((notification, index) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    onDelete={deleteNotification}
                    onClick={handleNotificationClick}
                    formatTimeAgo={formatTimeAgo}
                    t={t}
                    compact
                    index={index}
                  />
                ))}
              </div>
            )}
          </div>
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
                <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

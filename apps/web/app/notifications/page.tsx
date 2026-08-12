'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import type { Notification } from '@/types/notification';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { NotificationFilters, matchesFilter, NotificationList, NotificationSkeleton, PushPermissionBanner } from '@/components/notifications';
import type { FilterType } from '@/components/notifications';
import { formatNotificationTimeAgo } from '@/utils/notification-helpers';
import { Bell, Search, X, Check } from 'lucide-react';

function NotificationsPageContent() {
  const { t, locale } = useI18n('notifications');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const markAllReadHandled = useRef(false);

  const {
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore,
    hasMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchMore,
  } = useNotificationsManagerRQ();

  useEffect(() => {
    if (markAllReadHandled.current) return;
    if (searchParams.get('markAllRead') === 'true') {
      markAllReadHandled.current = true;
      markAllAsRead();
      toast.success(t('actions.allMarkedRead'));
      router.replace('/notifications');
    }
  }, [searchParams, markAllAsRead, router, t]);

  const filteredNotifications = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return notifications.filter((n) => {
      if (!matchesFilter(n, activeFilter)) return false;

      if (query) {
        const content = (n.content || '').toLowerCase();
        const actorName = (n.actor?.displayName || n.actor?.username || '').toLowerCase();
        const conversationTitle = (n.context?.conversationTitle || '').toLowerCase();

        return content.includes(query) || actorName.includes(query) || conversationTitle.includes(query);
      }

      return true;
    });
  }, [notifications, activeFilter, searchQuery]);

  const handleNotificationClick = useCallback((notification: Notification) => {
    // Marquage lu ; la navigation est portée par le lien interne de la rangée.
    markAsRead(notification.id);
  }, [markAsRead]);

  const formatTimeAgo = useCallback(
    (timestamp: Date | string | null) => formatNotificationTimeAgo(timestamp, t),
    [t]
  );

  if (isLoading && notifications.length === 0) {
    return (
      <DashboardLayout title={t('pageTitle')} hideSearch={true}>
        <div className="py-6">
          <div className="max-w-2xl mx-auto">
            <NotificationSkeleton count={5} />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={t('pageTitle')} hideSearch={true}>
      <div className="py-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Bell className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {t('pageTitle')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {notifications.length === 0
                    ? t('unreadCount.empty')
                    : unreadCount > 0
                      ? t('unreadCount.active', { count: String(unreadCount), total: String(notifications.length) })
                      : t('unreadCount.allRead', { total: String(notifications.length), plural: notifications.length > 1 ? 's' : '' })
                  }
                </p>
              </div>
            </div>

            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search')}
                className="border-border bg-muted/50 pl-10 pr-10 focus-visible:ring-2 focus-visible:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={t('actions.clearSearch')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {unreadCount > 0 && (
              <div className="mb-4">
                <Button onClick={markAllAsRead} size="sm" variant="outline">
                  <Check className="mr-2 h-4 w-4" />
                  <span>{t('markAllRead')}</span>
                </Button>
              </div>
            )}

            <NotificationFilters
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              notifications={notifications}
              t={t}
            />
          </div>

          <PushPermissionBanner />

          <NotificationList
            notifications={filteredNotifications}
            isLoading={isLoadingMore}
            hasMore={hasMore}
            onFetchMore={fetchMore}
            onMarkAsRead={markAsRead}
            onDelete={deleteNotification}
            onClick={handleNotificationClick}
            formatTimeAgo={formatTimeAgo}
            t={t}
            locale={locale}
            searchQuery={searchQuery}
            grouped={!searchQuery && activeFilter === 'all'}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGuard requireAuth={true} allowAnonymous={false}>
      <NotificationsPageContent />
    </AuthGuard>
  );
}

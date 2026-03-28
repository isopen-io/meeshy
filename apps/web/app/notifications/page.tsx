'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
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
import { Bell, Search, X, Check } from 'lucide-react';

function NotificationsPageContent() {
  const { t } = useI18n('notifications');
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

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);

    if (notification.context?.conversationId) {
      const url = notification.context?.messageId
        ? `/conversations/${notification.context.conversationId}?messageId=${notification.context.messageId}#message-${notification.context.messageId}`
        : `/conversations/${notification.context.conversationId}`;
      router.push(url);
    }
  };

  const formatTimeAgo = (timestamp: Date | string | null): string => {
    if (!timestamp) return '';

    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 0) return t('timeAgo.now');
    if (diffMinutes < 1) return t('timeAgo.now');
    if (diffMinutes < 60) return t('timeAgo.minute').replace('{count}', diffMinutes.toString());

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return t('timeAgo.hour').replace('{count}', diffHours.toString());

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t('timeAgo.day').replace('{count}', diffDays.toString());

    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  if (isLoading && notifications.length === 0) {
    return (
      <DashboardLayout title={t('pageTitle')} hideSearch={true}>
        <div className="py-6">
          <div className="max-w-4xl mx-auto">
            <NotificationSkeleton count={5} />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={t('pageTitle')} hideSearch={true}>
      <div className="py-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 mb-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
                <Bell className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {t('pageTitle')}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {unreadCount > 0
                    ? t('unreadCount.active', { count: String(unreadCount), total: String(notifications.length) })
                    : t('unreadCount.empty')
                  }
                </p>
              </div>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <Input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search')}
                className="pl-10 pr-10 backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border-white/30 dark:border-gray-700/40 focus:bg-white/70 dark:focus:bg-gray-800/70 focus:ring-2 focus:ring-blue-500/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label={t('actions.clearSearch')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {unreadCount > 0 && (
              <div className="mb-4">
                <Button
                  onClick={markAllAsRead}
                  size="sm"
                  variant="outline"
                  className="backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border-white/30 dark:border-gray-700/40 hover:bg-white/70 dark:hover:bg-gray-800/70"
                >
                  <Check className="h-4 w-4 mr-2" />
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
          </motion.div>

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

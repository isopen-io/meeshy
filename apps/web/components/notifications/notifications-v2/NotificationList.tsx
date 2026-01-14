/**
 * Composant NotificationList
 * Liste scrollable avec virtualisation et infinite scroll
 */

'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { NotificationItem } from './NotificationItem';
import { Loader2, Bell, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { NotificationListProps, Notification } from '@/types/notification';
import { cn } from '@/lib/utils';

/**
 * Composant NotificationList
 */
export function NotificationList({
  notifications,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  emptyMessage = 'No notifications',
  onNotificationClick,
  onRead,
  onDelete,
  onAfterNavigation
}: NotificationListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);

  /**
   * Intersection Observer pour l'infinite scroll
   */
  useEffect(() => {
    if (!observerTarget.current || !onLoadMore || !hasMore || isLoading) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          console.log('[NotificationList] Loading more notifications...');
          onLoadMore();
        }
      },
      {
        root: scrollRef.current,
        rootMargin: '100px',
        threshold: 0.1
      }
    );

    observer.observe(observerTarget.current);

    return () => {
      observer.disconnect();
    };
  }, [onLoadMore, hasMore, isLoading]);

  /**
   * État vide
   */
  if (notifications.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
          <Bell className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          No notifications
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {emptyMessage}
        </p>
      </div>
    );
  }

  /**
   * État de chargement initial
   */
  if (notifications.length === 0 && isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Loading notifications...
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full" ref={scrollRef}>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onRead={onRead}
            onDelete={onDelete}
            onAfterNavigation={onAfterNavigation}
          />
        ))}

        {/* Sentinel pour l'infinite scroll */}
        {hasMore && (
          <div
            ref={observerTarget}
            className="flex items-center justify-center py-4"
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={onLoadMore}
                className="text-blue-600 hover:text-blue-700"
              >
                Load more
              </Button>
            )}
          </div>
        )}

        {/* Indicateur de fin */}
        {!hasMore && notifications.length > 0 && (
          <div className="py-4 text-center text-xs text-gray-400">
            You've reached the end
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

/**
 * Composant NotificationListWithFilters
 * Ajoute des filtres au-dessus de la liste
 */
interface NotificationListWithFiltersProps extends NotificationListProps {
  filters?: {
    type?: string;
    isRead?: boolean;
  };
  onFilterChange?: (filters: any) => void;
  showFilters?: boolean;
}

export function NotificationListWithFilters({
  notifications,
  filters,
  onFilterChange,
  showFilters = true,
  ...listProps
}: NotificationListWithFiltersProps) {
  const [showFilterMenu, setShowFilterMenu] = React.useState(false);

  if (!showFilters) {
    return <NotificationList notifications={notifications} {...listProps} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Barre de filtres */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilterMenu(!showFilterMenu)}
          className="flex items-center gap-2"
        >
          <Filter className="w-4 h-4" />
          Filters
        </Button>

        {/* Badges de filtres actifs */}
        {filters?.type && filters.type !== 'all' && (
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full dark:bg-blue-900 dark:text-blue-200">
            {filters.type}
            <button
              onClick={() => onFilterChange?.({ ...filters, type: 'all' })}
              className="ml-1 hover:text-blue-900 dark:hover:text-blue-100"
            >
              ×
            </button>
          </span>
        )}

        {filters?.isRead !== undefined && (
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full dark:bg-blue-900 dark:text-blue-200">
            {filters.isRead ? 'Read' : 'Unread'}
            <button
              onClick={() => onFilterChange?.({ ...filters, isRead: undefined })}
              className="ml-1 hover:text-blue-900 dark:hover:text-blue-100"
            >
              ×
            </button>
          </span>
        )}

        {/* Bouton pour tout réinitialiser */}
        {(filters?.type !== 'all' || filters?.isRead !== undefined) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFilterChange?.({ type: 'all', isRead: undefined })}
            className="text-xs"
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Menu de filtres (expandable) */}
      {showFilterMenu && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="space-y-3">
            {/* Filtre par type */}
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Type
              </label>
              <div className="flex flex-wrap gap-2">
                {['all', 'new_message', 'message_reply', 'user_mentioned', 'message_reaction'].map((type) => (
                  <Button
                    key={type}
                    variant={filters?.type === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onFilterChange?.({ ...filters, type })}
                    className="text-xs"
                  >
                    {type === 'all' ? 'All' : type.replace('_', ' ')}
                  </Button>
                ))}
              </div>
            </div>

            {/* Filtre par statut */}
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Status
              </label>
              <div className="flex gap-2">
                <Button
                  variant={filters?.isRead === undefined ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onFilterChange?.({ ...filters, isRead: undefined })}
                  className="text-xs"
                >
                  All
                </Button>
                <Button
                  variant={filters?.isRead === false ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onFilterChange?.({ ...filters, isRead: false })}
                  className="text-xs"
                >
                  Unread
                </Button>
                <Button
                  variant={filters?.isRead === true ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onFilterChange?.({ ...filters, isRead: true })}
                  className="text-xs"
                >
                  Read
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="flex-1 overflow-hidden">
        <NotificationList notifications={notifications} {...listProps} />
      </div>
    </div>
  );
}

export default NotificationList;

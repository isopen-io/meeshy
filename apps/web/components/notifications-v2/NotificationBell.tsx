/**
 * Composant NotificationBell v2
 * Icône cloche avec badge compteur et dropdown simplifié
 */

'use client';

import React, { useState } from 'react';
import { Bell, Search, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NotificationList } from './NotificationList';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';
import type { NotificationBellProps } from '@/types/notification-v2';
import { cn } from '@/lib/utils';
import Link from 'next/link';

/**
 * Composant NotificationBell
 */
export function NotificationBell({
  count,
  onClick,
  showBadge = true,
  animated = true,
  className
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    fetchMore,
    markAllAsRead
  } = useNotificationsManagerRQ();

  const displayCount = count ?? unreadCount;

  // Filtrer les notifications par recherche texte
  const filteredNotifications = searchQuery
    ? notifications.filter(n =>
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : notifications;

  /**
   * Gère le clic sur la cloche
   */
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      setIsOpen(!isOpen);
    }
  };

  /**
   * Gère le marquage de toutes les notifications comme lues
   */
  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  /**
   * Gère le clic sur une notification
   */
  const handleNotificationClick = (notification: any) => {
    // Fermer le dropdown
    setIsOpen(false);
    // La navigation est gérée par NotificationItem
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClick}
          className={cn(
            'relative',
            animated && displayCount > 0 && 'animate-pulse',
            className
          )}
          aria-label={`Notifications (${displayCount} non lues)`}
        >
          <Bell className="h-5 w-5" />

          {/* Badge compteur */}
          {showBadge && displayCount > 0 && (
            <span
              className={cn(
                'absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center',
                'rounded-full bg-red-500 text-[10px] font-bold text-white',
                'ring-2 ring-background',
                animated && 'animate-pulse'
              )}
            >
              {displayCount > 99 ? '99+' : displayCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[70vw] sm:w-[420px] p-0"
        sideOffset={8}
      >
        <div className="flex flex-col h-[80vh] sm:h-[600px] max-h-[600px]">
          {/* Header */}
          <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
              Notifications
            </h3>

            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllAsRead}
                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 px-2 sm:px-3"
              >
                <span className="hidden sm:inline">Tout marquer comme lu</span>
                <span className="sm:hidden">Tout lire</span>
              </Button>
            )}
          </div>

          {/* Filtre de recherche */}
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Liste des notifications */}
          <div className="flex-1 overflow-auto">
            <NotificationList
              notifications={filteredNotifications}
              onLoadMore={fetchMore}
              hasMore={hasMore}
              isLoading={isLoading}
              emptyMessage={searchQuery ? "Aucune notification trouvée" : "Vous n'avez aucune notification"}
              onNotificationClick={handleNotificationClick}
              compact
            />
          </div>

          {/* Footer - Voir toutes les notifications */}
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-gray-200 dark:border-gray-700">
            <Link href="/notifications" onClick={() => setIsOpen(false)}>
              <Button
                variant="ghost"
                className="w-full justify-center text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs sm:text-sm"
              >
                <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Voir toutes les notifications</span>
                <span className="sm:hidden">Voir tout</span>
              </Button>
            </Link>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Composant NotificationBellSimple
 * Version simplifiée sans dropdown (juste le badge)
 */
export function NotificationBellSimple({
  count,
  onClick,
  showBadge = true,
  animated = true,
  className
}: NotificationBellProps) {
  // N'utilise PAS useNotificationsManager pour éviter les doublons de toast
  // Le compteur sera passé via la prop 'count' depuis le composant parent
  const displayCount = count ?? 0;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn(
        'relative',
        animated && displayCount > 0 && 'animate-pulse',
        className
      )}
      aria-label={`Notifications (${displayCount} non lues)`}
    >
      <Bell className="h-5 w-5" />

      {showBadge && displayCount > 0 && (
        <span
          className={cn(
            'absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center',
            'rounded-full bg-red-500 text-[10px] font-bold text-white',
            'ring-2 ring-background',
            animated && 'animate-pulse'
          )}
        >
          {displayCount > 99 ? '99+' : displayCount}
        </span>
      )}
    </Button>
  );
}

export default NotificationBell;

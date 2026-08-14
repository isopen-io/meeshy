'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';
import { useNotificationCountsQuery } from '@/hooks/queries/use-notifications-query';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import type { Notification } from '@/types/notification';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { NotificationFilters, FILTER_TYPES, NotificationList, NotificationSkeleton, PushPermissionBanner } from '@/components/notifications';
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

  // L'onglet part au SERVEUR : filtré sur les pages déjà chargées, « aucune
  // mention » ne voulait dire que « aucune mention parmi les vingt dernières »,
  // et rien n'allait chercher les autres. Le tableau vide de l'onglet « tout »
  // laisse l'inbox entière.
  const types = FILTER_TYPES[activeFilter];

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
  } = useNotificationsManagerRQ({ filters: { types } });

  // Les pastilles comptent l'inbox ENTIÈRE — les compter sur `notifications`
  // aurait rendu « 0 » sur tous les autres onglets dès que l'un d'eux filtre.
  const { data: counts } = useNotificationCountsQuery();

  useEffect(() => {
    if (markAllReadHandled.current) return;
    if (searchParams.get('markAllRead') === 'true') {
      markAllReadHandled.current = true;
      markAllAsRead();
      toast.success(t('actions.allMarkedRead'));
      router.replace('/notifications');
    }
  }, [searchParams, markAllAsRead, router, t]);

  // La recherche TEXTE reste locale, et l'assume : elle ne porte que sur les
  // pages chargées. Contrairement à l'onglet, elle ne prétend pas compter — le
  // champ est vide par défaut, et l'utilisateur voit défiler ce qu'il a sous les
  // yeux.
  const filteredNotifications = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return notifications;

    return notifications.filter((n) => {
      const content = (n.content || '').toLowerCase();
      const actorName = (n.actor?.displayName || n.actor?.username || '').toLowerCase();
      const conversationTitle = (n.context?.conversationTitle || '').toLowerCase();

      return content.includes(query) || actorName.includes(query) || conversationTitle.includes(query);
    });
  }, [notifications, searchQuery]);

  const handleNotificationClick = useCallback((notification: Notification) => {
    // Marquage lu ; la navigation est portée par le lien interne de la rangée.
    markAsRead(notification.id);
  }, [markAsRead]);

  const formatTimeAgo = useCallback(
    (timestamp: Date | string | null) => formatNotificationTimeAgo(timestamp, t),
    [t]
  );

  // Le squelette remplace la LISTE, jamais la page. Depuis que l'onglet filtre
  // côté serveur, en changer ouvre une requête, et le cache d'un onglet jamais
  // ouvert est vide : un squelette plein écran emporterait alors les onglets que
  // le lecteur vient de toucher et la recherche qu'il est en train de taper — à
  // chaque premier passage sur chaque onglet.
  const isColdList = isLoading && notifications.length === 0;

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
                {/* Le total vient du SERVEUR, pas de `notifications.length` :
                    compté sur les pages chargées, il annonçait « 20 notifications »
                    à qui en a trois cents, et changeait à chaque défilement. Rien
                    ne s'affiche tant qu'il n'est pas connu — un chiffre provisoire
                    qui saute ensuite se lit comme une correction, pas comme un
                    chargement. */}
                {counts !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    {counts.total === 0
                      ? t('unreadCount.empty')
                      : unreadCount > 0
                        ? t('unreadCount.active', { count: String(unreadCount), total: String(counts.total) })
                        : t('unreadCount.allRead', { total: String(counts.total), plural: counts.total > 1 ? 's' : '' })
                    }
                  </p>
                )}
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
              counts={counts}
              t={t}
            />
          </div>

          <PushPermissionBanner />

          {isColdList ? (
            <NotificationSkeleton count={5} />
          ) : (
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
          )}
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

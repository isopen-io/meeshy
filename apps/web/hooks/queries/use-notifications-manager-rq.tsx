'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useInfiniteNotificationsQuery,
  useMarkNotificationAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
  useDeleteNotificationMutation,
} from './use-notifications-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { notificationSocketIO } from '@/services/notification-socketio.singleton';
import { NotificationService } from '@/services/notification.service';
import type { Notification, NotificationCounts, NotificationQueryOptions } from '@/types/notification';
import type {
  NotificationDeletedBulkEventData,
  NotificationReadBulkEventData,
} from '@meeshy/shared/types/socketio-events';
import {
  notificationMatchesDeletedBulkScope,
  notificationMatchesReadBulkScope,
} from '@meeshy/shared/utils/notification-read-bulk';
import { toast } from 'sonner';
import { getNotificationIcon, getNotificationLink, getNotificationBorderColor } from '@/utils/notification-helpers';
import { buildNotificationBanner } from '@/utils/notification-banner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { closeDeliveredNotifications, revocationOfDeletedNotification } from '@/utils/notification-revocation';
import { useI18n } from '@/hooks/useI18n';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { hasAccountCredential } from '@/services/api-credential';

const recentToasts = new Set<string>();

/**
 * Cette liste-là accepterait-elle ce type ?
 *
 * L'onglet demandé au serveur voyage dans la CLÉ de la query
 * (`[...lists(), 'infinite', { types }]`) — c'est la seule trace disponible au
 * moment d'insérer une notification poussée par le socket. Une clé sans `types`,
 * ou avec une liste vide, est l'onglet « tout » et accepte donc tout.
 */
function listAcceptsType(key: unknown, type: string): boolean {
  if (!Array.isArray(key)) return true;

  const filters = key[key.length - 1] as { types?: readonly string[] } | undefined;
  const types = filters?.types;

  return !Array.isArray(types) || types.length === 0 || types.includes(type);
}

/** Miroir du débounce de `NotificationGapResyncCoordinator` (iOS, 0.3 s). */
const SYNC_RESYNC_DEBOUNCE_MS = 300;

interface UseNotificationsManagerRQOptions {
  filters?: NotificationQueryOptions;
  limit?: number;
}

export function useNotificationsManagerRQ(options: UseNotificationsManagerRQOptions = {}) {
  const { filters, limit = 20 } = options;
  const { t } = useI18n('notifications');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  // Lu au rendu, comme `ApiService` le lit à l'envoi : une seule autorité pour
  // « ce navigateur porte-t-il un compte ». Le re-rendu vient d'`isAuthenticated`,
  // que `setUser` déplace sur les deux chemins d'entrée.
  const hasAccount = hasAccountCredential();
  const isMobileRef = useRef(typeof window !== 'undefined' && window.innerWidth < 768);
  const resyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    data: notificationsData,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  // `enabled` : le manager est monté au layout RACINE (TabNotificationManager),
  // donc aussi sur /login, /join/*, etc. Sans garde, la query (refetchOnMount
  // 'always' + withRetry) tirait des GET /notifications non authentifiés sur
  // toutes les pages publiques.
  //
  // `isAuthenticated` seul ne suffit PAS : il dit « une identité existe », pas
  // « un compte existe ». `joinAnonymously` pose `setUser(participant)`, donc un
  // visiteur entré par lien franchissait le garde et tirait une requête que le
  // gateway réserve aux comptes (401 sans en-tête, 403 avec `X-Session-Token`).
  } = useInfiniteNotificationsQuery({ limit, enabled: isAuthenticated && hasAccount, ...filters });

  const unreadCount = notificationsData?.pages[0]?.unreadCount ?? 0;

  const markAsReadMutation = useMarkNotificationAsReadMutation();
  const markAllAsReadMutation = useMarkAllNotificationsAsReadMutation();
  const deleteMutation = useDeleteNotificationMutation();

  // `useMemo` : sans lui, ce `flatMap` fabrique un tableau d'identité NEUVE à
  // chaque rendu du manager — monté au layout racine, donc ré-évalué par toute
  // l'application. Chaque consommateur (`NotificationList`, `NotificationDropdown`,
  // la page /notifications) recevait alors une prop `notifications` « changée »
  // sans qu'aucune notification n'ait bougé, et re-rendait sa liste entière.
  const notifications = useMemo(
    () => notificationsData?.pages.flatMap(page => page?.notifications ?? []) ?? [],
    [notificationsData]
  );

  const showNotificationToast = useCallback((notification: Notification) => {
    const toastKey = `${notification.id}-${notification.state.createdAt}`;

    if (recentToasts.has(toastKey)) return;

    recentToasts.add(toastKey);
    setTimeout(() => recentToasts.delete(toastKey), 5000);

    // Une bannière doit dire CE QUI vient d'arriver : la phrase d'action
    // localisée par le SERVEUR, le groupe pour un message de groupe, et la
    // vignette du contenu visé devant la charge. @see utils/notification-banner
    const banner = buildNotificationBanner(notification, t);
    const link = getNotificationLink(notification);
    const borderColor = getNotificationBorderColor(notification);
    const duration = isMobileRef.current ? 2000 : 4000;
    const actor = notification.actor;
    const initial = (actor?.displayName || actor?.username || 'U').charAt(0).toUpperCase();

    toast.custom(
      (toastId) => (
        <div
          role="button"
          tabIndex={0}
          aria-label={[banner.headline, banner.reactionBadge, banner.body].filter(Boolean).join(', ')}
          className={`flex items-start gap-3 p-4 bg-background border rounded-lg shadow-lg cursor-pointer ${borderColor}`}
          onClick={() => {
            toast.dismiss(toastId);
            if (link) router.push(link);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toast.dismiss(toastId);
            if (link) router.push(link);
          }}
        >
          <Avatar className="h-9 w-9 flex-shrink-0 ring-1 ring-border">
            <AvatarImage src={actor?.avatar || undefined} alt="" />
            <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
              {initial}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{banner.headline}</p>
            {(banner.body || banner.thumbnailUrl || banner.reactionBadge) && (
              <div className="mt-1 flex items-center gap-2">
                <span className="relative flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-xs">
                  {banner.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={banner.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    getNotificationIcon(notification).emoji
                  )}
                  {banner.reactionBadge && (
                    <span className="absolute -bottom-0.5 -right-0.5 text-[10px] leading-none">
                      {banner.reactionBadge}
                    </span>
                  )}
                </span>
                {banner.body && (
                  <p className="truncate text-xs text-muted-foreground">{banner.body}</p>
                )}
              </div>
            )}
          </div>
        </div>
      ),
      { duration }
    );
  }, [t, router]);

  useEffect(() => {
    const authToken = useAuthStore.getState().authToken;

    if (!isAuthenticated && !authToken) return;

    if (authToken) {
      notificationSocketIO.connect(authToken);
    }

    const handleNewNotification = (incoming: Notification) => {
      const notificationConversationId = incoming.context?.conversationId;
      const activeConversationId = useNotificationStore.getState().activeConversationId;
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const isInActiveConversation = notificationConversationId && (
        activeConversationId === notificationConversationId ||
        currentPath.includes(`/conversations/${notificationConversationId}`)
      );

      // Une notification pour la conversation OUVERTE naît consommée (miroir du
      // `markConsumedOnArrival` iOS) : insérée déjà lue — sinon la liste montre
      // une ligne non lue alors que le compteur n'a pas bougé — et marquée lue
      // côté serveur pour que `notification:counts` et le badge push ne la
      // recomptent pas.
      const notification: Notification = isInActiveConversation
        ? { ...incoming, state: { ...incoming.state, isRead: true, readAt: new Date() } }
        : incoming;
      if (isInActiveConversation) {
        NotificationService.markAsRead(incoming.id).catch(() => {});
      }

      const queries = queryClient.getQueriesData({ queryKey: queryKeys.notifications.lists(), exact: false });

      // Aucune liste n'a encore de données (fetch initial en vol, ou écran
      // jamais monté) : `setQueriesData` ci-dessous n'écrirait NULLE PART et la
      // notification serait perdue sans rattrapage, `staleTime: Infinity`
      // interdisant toute relecture. On invalide pour forcer le serveur.
      const hasCachedList = queries.some(([_key, data]: [unknown, unknown]) =>
        !!data && typeof data === 'object' && 'pages' in data
      );

      if (!hasCachedList) {
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.lists() });
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
      }

      const notificationExists = queries.some(([_key, data]: [unknown, unknown]) => {
        if (!data || typeof data !== 'object' || !('pages' in data)) return false;
        const d = data as { pages: Array<{ notifications?: Notification[] }> };
        return d.pages.some((page) =>
          (page.notifications ?? []).some((n: Notification) => n.id === notification.id)
        );
      });

      if (!notificationExists) {
        // Écriture clé par clé, et non `setQueriesData` : depuis que l'onglet
        // filtre côté SERVEUR, chaque liste porte dans sa clé les types qu'elle
        // a demandés. Une écriture aveugle ferait apparaître une demande d'ami
        // au milieu de l'onglet « mentions » — le socket contredirait le filtre
        // que la liste vient d'appliquer.
        queries.forEach(([key]: [unknown, unknown]) => {
          if (!listAcceptsType(key, notification.type)) return;

          queryClient.setQueryData(key as readonly unknown[], (old: unknown) => {
            if (!old || typeof old !== 'object' || !('pages' in old)) return old;
            const data = old as { pages: Array<{ notifications?: Notification[]; unreadCount?: number }>; pageParams: unknown[] };

            const updatedPages = data.pages.map((page, index: number) => {
              if (index === 0) {
                return {
                  ...page,
                  notifications: [notification, ...(page.notifications ?? [])],
                  unreadCount: isInActiveConversation
                    ? (page.unreadCount ?? 0)
                    : (page.unreadCount ?? 0) + 1,
                };
              }
              return page;
            });

            return { ...data, pages: updatedPages };
          });
        });

        // Les totaux d'onglets sont SERVEUR ; sans ce report, la pastille de
        // l'onglet resterait au chiffre de la dernière lecture pendant que la
        // ligne, elle, s'affiche.
        queryClient.setQueryData(
          queryKeys.notifications.counts(),
          (old: NotificationCounts | undefined) =>
            old === undefined
              ? old
              : {
                  ...old,
                  total: old.total + 1,
                  unread: isInActiveConversation ? old.unread : old.unread + 1,
                  byType: {
                    ...old.byType,
                    [notification.type]: (old.byType?.[notification.type] ?? 0) + 1,
                  },
                }
        );

        if (!isInActiveConversation) {
          queryClient.setQueryData(
            queryKeys.notifications.unreadCount(),
            (old: number | undefined) => (old ?? 0) + 1
          );
        }
      }

      if (isInActiveConversation || currentPath === '/notifications') return;

      showNotificationToast(notification);

      try {
        const soundFile = notification.type === 'user_mentioned'
          ? '/sounds/mention.ogg'
          : '/sounds/notification.ogg';
        const volume = notification.type === 'user_mentioned' ? 0.7 : 0.6;
        const audio = new Audio(soundFile);
        audio.volume = volume;
        audio.play().catch(() => {});
      } catch {
        // Silently ignore audio playback errors
      }
    };

    const handleNotificationRead = (notificationId: string) => {
      let wasUnread = false;

      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[]; unreadCount?: number }>; pageParams: unknown[] };

          const foundUnread = data.pages.some((page) =>
            page.notifications?.some((n: Notification) => n.id === notificationId && !n.state.isRead)
          );
          if (foundUnread) wasUnread = true;

          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notifications: page.notifications?.map((n: Notification) =>
                n.id === notificationId
                  ? { ...n, state: { ...n.state, isRead: true, readAt: new Date() } }
                  : n
              ),
              unreadCount: foundUnread
                ? Math.max(0, (page.unreadCount ?? 0) - 1)
                : page.unreadCount,
            })),
          };
        }
      );

      if (wasUnread) {
        queryClient.setQueryData(
          queryKeys.notifications.unreadCount(),
          (old: number | undefined) => Math.max(0, (old ?? 1) - 1)
        );
      }
    };

    // `notification:read-bulk` — un marquage EN MASSE côté gateway
    // (`updateMany`/`$runCommandRaw`) ne renvoie aucun id : l'événement annonce
    // le PRÉDICAT appliqué, rejoué ici sur les pages en cache via l'énoncé
    // partagé du prédicat (aucune réécriture locale — web et iOS marqueraient
    // sinon des lignes différentes de celles marquées en base).
    //
    // Le badge n'est pas touché : ce cache est PARTIEL (pagination), il matche
    // donc moins de lignes que le serveur n'en a marquées, et décrémenter d'ici
    // le ferait dériver. `notification:counts`, émis juste après, est
    // autoritaire et absolu.
    const handleNotificationReadBulk = ({ scope }: NotificationReadBulkEventData) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[] }>; pageParams: unknown[] };

          const touched = data.pages.some((page) =>
            page.notifications?.some(
              (n: Notification) => !n.state.isRead && notificationMatchesReadBulkScope(scope, n)
            )
          );
          if (!touched) return old;

          const readAt = new Date();
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notifications: page.notifications?.map((n: Notification) =>
                !n.state.isRead && notificationMatchesReadBulkScope(scope, n)
                  ? { ...n, state: { ...n.state, isRead: true, readAt } }
                  : n
              ),
            })),
          };
        }
      );
    };

    const handleNotificationDeleted = (notificationId: string) => {
      // La bannière déjà livrée par un Service Worker part avec la ligne : le
      // serveur a retiré la notification, l'écran de l'OS ne doit plus la
      // montrer. Best effort — la liste et les compteurs ne l'attendent pas.
      void closeDeliveredNotifications(revocationOfDeletedNotification(notificationId)).catch(() => {});

      let wasUnread = false;

      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[]; unreadCount?: number }>; pageParams: unknown[] };

          const foundUnread = data.pages.some((page) =>
            page.notifications?.some((n: Notification) => n.id === notificationId && !n.state.isRead)
          );
          if (foundUnread) wasUnread = true;

          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notifications: page.notifications?.filter((n: Notification) => n.id !== notificationId),
              unreadCount: foundUnread
                ? Math.max(0, (page.unreadCount ?? 0) - 1)
                : page.unreadCount,
            })),
          };
        }
      );

      if (wasUnread) {
        queryClient.setQueryData(
          queryKeys.notifications.unreadCount(),
          (old: number | undefined) => Math.max(0, (old ?? 1) - 1)
        );
      }

      // Les totaux d'onglets sont SERVEUR, et une suppression venue d'un AUTRE
      // appareil ne dit pas combien il en reste par type. À l'arrivée d'une
      // notification, le report optimiste suffit (on connaît le type, et c'est
      // le chemin fréquent) ; ici on relit — une purge est rare, et deviner le
      // décompte d'une portée qu'on n'a qu'en partie en cache donnerait un
      // chiffre faux qui a l'air juste.
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.counts() });
    };

    // `notification:deleted-bulk` — symétrique du précédent côté PURGE, et son
    // cas est plus fort : `notification:counts` ne dit RIEN d'une purge des
    // lues (les lignes qui partent sont déjà lues, `unread` est inchangé).
    // Sans ce handler, vider sa cloche sur un appareil la laisse pleine ici,
    // chaque ligne ouvrant un écran dont la notification n'existe plus.
    //
    // Le badge n'est pas touché — et ici ce n'est plus une précaution mais une
    // CONSÉQUENCE du prédicat : toute ligne retirée était lue, donc jamais
    // comptée dans `unreadCount`.
    const handleNotificationDeletedBulk = ({ scope }: NotificationDeletedBulkEventData) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[] }>; pageParams: unknown[] };

          const touched = data.pages.some((page) =>
            page.notifications?.some((n: Notification) => notificationMatchesDeletedBulkScope(scope, n))
          );
          if (!touched) return old;

          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notifications: page.notifications?.filter(
                (n: Notification) => !notificationMatchesDeletedBulkScope(scope, n)
              ),
            })),
          };
        }
      );

      // Les totaux d'onglets sont SERVEUR, et une suppression venue d'un AUTRE
      // appareil ne dit pas combien il en reste par type. À l'arrivée d'une
      // notification, le report optimiste suffit (on connaît le type, et c'est
      // le chemin fréquent) ; ici on relit — une purge est rare, et deviner le
      // décompte d'une portée qu'on n'a qu'en partie en cache donnerait un
      // chiffre faux qui a l'air juste.
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.counts() });
    };

    // `notification:counts` est la resync AUTORITAIRE du serveur : émise après
    // chaque marquage côté gateway (ouverture de conversation, vue d'un post,
    // action sur un autre appareil). Sans elle, la cloche ne se corrigeait
    // qu'au prochain refetch (montage / focus fenêtre).
    const handleCounts = (counts: { unread?: number; total?: number }) => {
      if (typeof counts?.unread !== 'number') return;

      queryClient.setQueriesData(
        { queryKey: queryKeys.notifications.lists(), exact: false },
        (old: unknown) => {
          if (!old || typeof old !== 'object' || !('pages' in old)) return old;
          const data = old as { pages: Array<{ notifications?: Notification[]; unreadCount?: number }>; pageParams: unknown[] };
          if (data.pages.every((page) => page.unreadCount === counts.unread)) return old;
          return {
            ...data,
            pages: data.pages.map((page) => ({ ...page, unreadCount: counts.unread })),
          };
        }
      );

      queryClient.setQueryData(queryKeys.notifications.unreadCount(), counts.unread);
    };

    // SyncEngine — le transport a détecté que le client a perdu de vue l'état
    // serveur (trou de `_seq`, ou reconnexion après coupure). Le client global
    // tourne en `staleTime: Infinity` : sans ce rattrapage, les notifications
    // manquées ne réapparaissent JAMAIS de la session, ni dans la cloche ni sur
    // /notifications. Le refetch est idempotent (la réponse serveur remplace
    // les pages, dédup par id inhérente) et débouncé pour coaléscer une rafale
    // — un gap suivi d'un reconnect ne paie qu'une resync.
    const scheduleResync = () => {
      if (resyncTimerRef.current !== null) clearTimeout(resyncTimerRef.current);
      resyncTimerRef.current = setTimeout(() => {
        resyncTimerRef.current = null;
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.lists() });
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
      }, SYNC_RESYNC_DEBOUNCE_MS);
    };

    const unsubscribeNotification = notificationSocketIO.onNotification(handleNewNotification);
    const unsubscribeRead = notificationSocketIO.onNotificationRead(handleNotificationRead);
    const unsubscribeReadBulk = notificationSocketIO.onNotificationReadBulk(handleNotificationReadBulk);
    const unsubscribeDeleted = notificationSocketIO.onNotificationDeleted(handleNotificationDeleted);
    const unsubscribeDeletedBulk = notificationSocketIO.onNotificationDeletedBulk(handleNotificationDeletedBulk);
    const unsubscribeCounts = notificationSocketIO.onCounts(handleCounts);
    const unsubscribeDesync = notificationSocketIO.onSyncDesync(scheduleResync);

    return () => {
      unsubscribeNotification();
      unsubscribeRead();
      unsubscribeReadBulk();
      unsubscribeDeleted();
      unsubscribeDeletedBulk();
      unsubscribeCounts();
      unsubscribeDesync();
      if (resyncTimerRef.current !== null) {
        clearTimeout(resyncTimerRef.current);
        resyncTimerRef.current = null;
      }
    };
  }, [isAuthenticated, queryClient, showNotificationToast]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await markAsReadMutation.mutateAsync(notificationId);
    } catch {
      // Silently ignore - optimistic update handles UI
    }
  }, [markAsReadMutation]);

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllAsReadMutation.mutateAsync();
    } catch {
      // Silently ignore - optimistic update handles UI
    }
  }, [markAllAsReadMutation]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      await deleteMutation.mutateAsync(notificationId);
    } catch {
      // Silently ignore - optimistic update handles UI
    }
  }, [deleteMutation]);

  const fetchMore = useCallback(async () => {
    if (hasNextPage && !isFetchingNextPage) {
      await fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    error: null,

    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchMore,
    refresh,

    counts: {
      total: notifications.length,
      unread: unreadCount,
    },
  };
}

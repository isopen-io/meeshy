/**
 * Marquage des notifications par PORTÉE (conversation / post) — miroir web du
 * `NotificationCachePatch` iOS.
 *
 * Ouvrir une conversation, un post, un réel ou une story consomme les
 * notifications associées. Chaque appel fait le duo :
 *  1. patch IMMÉDIAT du cache React Query de la cloche (lignes lues + compteurs
 *     décrémentés) — l'UI ne doit jamais attendre l'aller-retour serveur ;
 *  2. route serveur de portée (`POST /notifications/conversation/:id/read` ou
 *     `POST /notifications/post/:id/read`), coalescée par scope : une story de
 *     10 slides émet 10 posts distincts, mais un slide revisité dans la
 *     fenêtre ne repart pas.
 *
 * Le serveur répond par `notification:counts` (valeur autoritaire) qui recale
 * les compteurs si le patch local avait dérivé.
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { NotificationService } from '@/services/notification.service';
import { useAuthStore } from '@/stores/auth-store';
import type { Notification } from '@/types/notification';

export type NotificationReadScope =
  | { readonly kind: 'conversation'; readonly conversationId: string }
  | { readonly kind: 'post'; readonly postId: string };

type NotificationsPage = {
  notifications?: Notification[];
  unreadCount?: number;
};

type InfiniteNotificationsData = {
  pages: NotificationsPage[];
  pageParams: unknown[];
};

export function notificationMatchesScope(
  notification: Notification,
  scope: NotificationReadScope
): boolean {
  if (scope.kind === 'conversation') {
    return notification.context?.conversationId === scope.conversationId;
  }
  return notification.context?.postId === scope.postId;
}

/**
 * Marque lues dans le cache toutes les notifications non lues du scope.
 * Retourne le nombre de notifications marquées (0 = cache déjà à jour).
 */
export function applyScopeReadToCache(
  queryClient: QueryClient,
  scope: NotificationReadScope
): number {
  let maxMarked = 0;

  queryClient.setQueriesData(
    { queryKey: queryKeys.notifications.lists(), exact: false },
    (old: unknown) => {
      if (!old || typeof old !== 'object' || !('pages' in old)) return old;
      const data = old as InfiniteNotificationsData;

      let markedInQuery = 0;
      const readAt = new Date();
      const pages = data.pages.map((page) => ({
        ...page,
        notifications: page.notifications?.map((n) => {
          if (!n.state.isRead && notificationMatchesScope(n, scope)) {
            markedInQuery += 1;
            return { ...n, state: { ...n.state, isRead: true, readAt } };
          }
          return n;
        }),
      }));

      if (markedInQuery === 0) return old;
      maxMarked = Math.max(maxMarked, markedInQuery);

      // `unreadCount` est le compteur GLOBAL renvoyé par le serveur sur chaque
      // page — décrémenter chaque page du même montant garde la cohérence
      // (la cloche lit pages[0].unreadCount).
      return {
        ...data,
        pages: pages.map((page) => ({
          ...page,
          unreadCount: Math.max(0, (page.unreadCount ?? 0) - markedInQuery),
        })),
      };
    }
  );

  if (maxMarked > 0) {
    queryClient.setQueryData(
      queryKeys.notifications.unreadCount(),
      (old: number | undefined) => Math.max(0, (old ?? maxMarked) - maxMarked)
    );
  }

  return maxMarked;
}

/**
 * Fenêtre de coalescing des appels serveur par scope — même valeur que le
 * `conversationReadMinInterval` du NotificationToastManager iOS.
 */
const SERVER_MARK_COALESCE_MS = 5000;
const lastServerMarkAt = new Map<string, number>();

function scopeKey(scope: NotificationReadScope): string {
  return scope.kind === 'conversation'
    ? `conversation:${scope.conversationId}`
    : `post:${scope.postId}`;
}

/**
 * Point d'entrée unique : patch local immédiat + marquage serveur coalescé.
 * Fire-and-forget côté serveur — un échec rouvre la fenêtre pour réessayer au
 * prochain déclencheur.
 */
export function markScopeNotificationsRead(
  queryClient: QueryClient,
  scope: NotificationReadScope
): void {
  // Garde CENTRALE d'authentification : les sessions anonymes (liens de
  // partage — /chat/:id, story publique) n'ont pas de notifications et la
  // route gateway est JWT-only. Sans cette garde, chaque ouverture anonyme
  // déclenchait un 401 rejoué par withRetry + la file de refresh token.
  if (!useAuthStore.getState().authToken) return;

  applyScopeReadToCache(queryClient, scope);

  const key = scopeKey(scope);
  const now = Date.now();
  // Purge des entrées expirées (Map bornée par l'activité de la fenêtre —
  // une session longue de stories n'accumule pas une entrée par slide à vie).
  for (const [k, at] of lastServerMarkAt) {
    if (now - at >= SERVER_MARK_COALESCE_MS) lastServerMarkAt.delete(k);
  }
  const last = lastServerMarkAt.get(key);
  if (last !== undefined && now - last < SERVER_MARK_COALESCE_MS) return;
  lastServerMarkAt.set(key, now);

  const request =
    scope.kind === 'conversation'
      ? NotificationService.markConversationRead(scope.conversationId)
      : NotificationService.markPostRead(scope.postId);

  request.catch(() => {
    lastServerMarkAt.delete(key);
  });
}

export function __resetNotificationReadSyncForTests(): void {
  lastServerMarkAt.clear();
}

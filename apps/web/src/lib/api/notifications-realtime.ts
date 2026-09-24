import type { QueryClient } from '@tanstack/react-query';

import type {
  NotificationDeletedBulkScope,
  NotificationReadBulkContextKey,
  NotificationReadBulkScope,
} from '@meeshy/shared/types/notification';
import {
  notificationMatchesDeletedBulkScope,
  notificationMatchesReadBulkScope,
} from '@meeshy/shared/utils/notification-read-bulk';

import type { NotificationRecord } from '@/lib/notifications/record';

import {
  adjustNotificationCounts,
  findNotification,
  markNotificationsRead,
  prependNotification,
  removeNotifications,
  replaceNotificationCounts,
} from './notifications-cache';
import { NOTIFICATION_LISTS_KEY, decodeNotificationCounts } from './notifications';

/**
 * **LES ÉVÉNEMENTS `notification:*` APPLIQUÉS AU CACHE** (#6288) — des
 * fonctions PURES sur le `QueryClient`, que `api/socket.ts` BRANCHE (D-40 : la
 * règle ici, le transport là-bas). Sœur de `realtime-apply.ts`, séparée d'elle
 * parce que la cloche a son propre cache et ses propres lois — la réunir au
 * fichier des conversations l'aurait fait grossir d'un domaine qu'il ne
 * connaît pas.
 *
 * Contrat de la passerelle (`NotificationService.ts`), et ce qu'il impose :
 *  - `notification:new` est suivi de `notification:counts` : l'incrément local
 *    est une AVANCE, que le compte serveur remplace aussitôt ;
 *  - `notification:read` / `read-bulk` / `deleted-bulk` ne portent AUCUN
 *    compte : ils ne touchent qu'aux LIGNES, le compte attend
 *    `notification:counts` (décrémenter ici doublerait le décrément optimiste
 *    de l'appareil qui a fait le geste) ;
 *  - les prédicats des marquages en masse sont rejoués par la loi PARTAGÉE
 *    (`notification-read-bulk.ts`), jamais réécrite ici.
 *
 * Toute charge qui ne décode pas est IGNORÉE, jamais une exception : un
 * gestionnaire qui lève couperait la connexion pour tous les événements suivants.
 */

type Json = Readonly<Record<string, unknown>>;

const objectOf = (value: unknown): Json | null => (typeof value === 'object' && value !== null ? (value as Json) : null);

const READ_BULK_CONTEXT_KEYS: readonly NotificationReadBulkContextKey[] = ['conversationId', 'postId', 'friendRequestId'];

function readBulkScopeOf(payload: unknown): NotificationReadBulkScope | null {
  const scope = objectOf(objectOf(payload)?.scope);
  if (scope?.kind === 'all') return { kind: 'all' };
  if (scope?.kind === 'types') {
    const types = Array.isArray(scope.types) ? scope.types.filter((t: unknown): t is string => typeof t === 'string') : [];
    return types.length === 0 ? null : { kind: 'types', types };
  }
  if (scope?.kind === 'context') {
    const contextKey = READ_BULK_CONTEXT_KEYS.find((key) => key === scope.contextKey);
    return contextKey === undefined || typeof scope.contextValue !== 'string'
      ? null
      : { kind: 'context', contextKey, contextValue: scope.contextValue };
  }
  return null;
}

function deletedBulkScopeOf(payload: unknown): NotificationDeletedBulkScope | null {
  return objectOf(objectOf(payload)?.scope)?.kind === 'read' ? { kind: 'read' } : null;
}

const notificationIdOf = (payload: unknown): string | null => {
  const id = objectOf(payload)?.notificationId;
  return typeof id === 'string' && id.length > 0 ? id : null;
};

/**
 * Une notification NEUVE, déjà décodée : en tête de chaque catégorie en cache
 * qui l'accepte, le compte AVANCÉ d'un si elle est non lue. Une ligne déjà
 * connue ne compte pas deux fois.
 *
 * Les listes sont marquées PÉRIMÉES sans être relues (`refetchType: 'none'`) :
 * la charge socket porte le titre de la BANNIÈRE (le nom de l'acteur), pas le
 * titre persisté de la liste — la prochaine lecture, au retour sur l'écran, les
 * réconcilie sans qu'aucune requête ne parte maintenant.
 */
export function applyNotificationNew(queryClient: QueryClient, notification: NotificationRecord): void {
  if (findNotification(queryClient, notification.id) !== undefined) return;
  prependNotification(queryClient, notification);
  adjustNotificationCounts(queryClient, { total: 1, unread: notification.state.isRead ? 0 : 1 });
  void queryClient.invalidateQueries({ queryKey: NOTIFICATION_LISTS_KEY, refetchType: 'none' });
}

export function applyNotificationRead(queryClient: QueryClient, payload: unknown): void {
  const id = notificationIdOf(payload);
  if (id === null) return;
  markNotificationsRead(queryClient, (n) => n.id === id);
}

export function applyNotificationReadBulk(queryClient: QueryClient, payload: unknown): void {
  const scope = readBulkScopeOf(payload);
  if (scope === null) return;
  markNotificationsRead(queryClient, (n) => notificationMatchesReadBulkScope(scope, n));
}

export function applyNotificationDeleted(queryClient: QueryClient, payload: unknown): void {
  const id = notificationIdOf(payload);
  if (id === null) return;
  removeNotifications(queryClient, (n) => n.id === id);
}

export function applyNotificationDeletedBulk(queryClient: QueryClient, payload: unknown): void {
  const scope = deletedBulkScopeOf(payload);
  if (scope === null) return;
  removeNotifications(queryClient, (n) => notificationMatchesDeletedBulkScope(scope, n));
}

/** Le compte SERVEUR remplace le compte local. `byType` n'y voyage pas toujours
 * (`emitCountsUpdate` n'émet que `{ unread, total }`) : absent, celui connu reste. */
export function applyNotificationCounts(queryClient: QueryClient, payload: unknown): void {
  const counts = decodeNotificationCounts(payload);
  if (counts === null) return;
  replaceNotificationCounts(queryClient, counts, { keepByType: objectOf(payload)?.byType === undefined });
}

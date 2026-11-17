import type { QueryClient } from '@tanstack/react-query';

import { offerInAppBanner } from '@/lib/notifications/in-app-banner';
import { decodeRealtimeNotification } from '@/lib/notifications/record';

import {
  applyNotificationCounts,
  applyNotificationDeleted,
  applyNotificationDeletedBulk,
  applyNotificationNew,
  applyNotificationRead,
  applyNotificationReadBulk,
  notificationIdOf,
} from './notifications-realtime';
import { catchUpThreadMessage } from './realtime-thread-catch-up';

/**
 * **LES ÉVÉNEMENTS `notification:*` DE LA CONNEXION** (#6288, #8727) — le
 * câblage que `api/socket.ts` confie à ce module (le fichier de la connexion
 * est au plafond de budget : un domaine de plus s'y extrait, il ne s'y ajoute
 * pas). Les LOIS du cache vivent dans `notifications-realtime.ts` ; ici vivent
 * la mémoire de la connexion (dédoublonnage) et ce qui part vers l'écran.
 *
 * Le DÉDOUBLONNAGE de `notification:new` vit sur la connexion : une
 * notification dont aucune liste n'est en cache (cloche jamais ouverte) ne
 * peut pas être reconnue par le cache, et le compte l'avancerait à chaque
 * rediffusion. La mémoire est BORNÉE — une session longue ne doit rien
 * retenir d'autre que les derniers identifiants vus.
 */

/** Les notifications qui annoncent l'ARRIVÉE d'un message — jamais une
 * réaction ni une édition, qui nomment un message que le fil peut ne pas avoir
 * chargé sans qu'il manque quoi que ce soit (#9291). */
const MESSAGE_ARRIVAL_NOTIFICATIONS: ReadonlySet<string> = new Set(['new_message', 'message_reply', 'user_mentioned', 'mention']);

const SEEN_NOTIFICATIONS_CAP = 200;

export type NotificationLiveHandlers = {
  readonly onNew: (payload: unknown) => void;
  readonly onRead: (payload: unknown) => void;
  readonly onReadBulk: (payload: unknown) => void;
  readonly onDeleted: (payload: unknown) => void;
  readonly onDeletedBulk: (payload: unknown) => void;
  readonly onCounts: (payload: unknown) => void;
};

export function createNotificationLiveHandlers(deps: { readonly queryClient: QueryClient }): NotificationLiveHandlers {
  const { queryClient } = deps;
  const seenNotifications = new Set<string>();

  const onNew = (payload: unknown): void => {
    const notification = decodeRealtimeNotification(payload);
    if (notification === null || seenNotifications.has(notification.id)) return;
    seenNotifications.add(notification.id);
    if (seenNotifications.size > SEEN_NOTIFICATIONS_CAP) {
      const oldest = seenNotifications.values().next().value;
      if (oldest !== undefined) seenNotifications.delete(oldest);
    }
    applyNotificationNew(queryClient, notification);
    /* LA CLOCHE SONNE, LE FIL SUIT (#9291) — la notification d'un message
       absent du fil ouvert le relit. */
    const { conversationId, messageId } = notification.context;
    if (MESSAGE_ARRIVAL_NOTIFICATIONS.has(notification.type) && conversationId !== undefined && messageId !== undefined) {
      catchUpThreadMessage(queryClient, { conversationId, messageId });
    }
    /* LA BANNIÈRE IN-APP (#8727) — seulement devant un onglet VISIBLE : un
       onglet caché reçoit le push système, et une bannière posée pendant
       l'absence surgirait, périmée, au retour. */
    if (typeof document !== 'undefined' && !document.hidden) offerInAppBanner(notification, { pathname: window.location.pathname });
  };

  /* Un id supprimé qui revient est une notification RÉÉCRITE (édition :
     `notification:deleted` puis `notification:new`, même identité) — la
     mémoire de dédoublonnage l'oublie pour la laisser reprendre sa place. */
  const onDeleted = (payload: unknown): void => {
    const id = notificationIdOf(payload);
    if (id !== null) seenNotifications.delete(id);
    applyNotificationDeleted(queryClient, payload);
  };

  return {
    onNew,
    onRead: (payload) => applyNotificationRead(queryClient, payload),
    onReadBulk: (payload) => applyNotificationReadBulk(queryClient, payload),
    onDeleted,
    onDeletedBulk: (payload) => applyNotificationDeletedBulk(queryClient, payload),
    onCounts: (payload) => applyNotificationCounts(queryClient, payload),
  };
}

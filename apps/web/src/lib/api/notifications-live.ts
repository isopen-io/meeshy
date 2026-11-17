import type { QueryClient } from '@tanstack/react-query';

import {
  conversationOnScreen,
  inAppBannerStore,
  isCallLayerNotification,
  offerInAppBanner,
  retractInAppBanner,
} from '@/lib/notifications/in-app-banner';
import { decodeRealtimeNotification } from '@/lib/notifications/record';

import { performMarkNotificationRead } from './notifications-actions';
import type { NotificationsDeps } from './notifications';
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

/** La fenêtre où un `new` du même id qu'un `deleted` est une RÉÉCRITURE (la passerelle annonce une édition par les deux, à la suite). */
const REWRITE_WINDOW_MS = 5_000;
const REWRITES_CAP = 50;

type Rewrite = { readonly at: number; readonly wasShowing: boolean };

export type NotificationLiveHandlers = {
  readonly onNew: (payload: unknown) => void;
  readonly onRead: (payload: unknown) => void;
  readonly onReadBulk: (payload: unknown) => void;
  readonly onDeleted: (payload: unknown) => void;
  readonly onDeletedBulk: (payload: unknown) => void;
  readonly onCounts: (payload: unknown) => void;
};

export function createNotificationLiveHandlers(deps: {
  readonly queryClient: QueryClient;
  readonly now?: (() => number) | undefined;
  readonly notificationsApi?: NotificationsDeps | undefined;
}): NotificationLiveHandlers {
  const { queryClient, notificationsApi } = deps;
  const now = deps.now ?? Date.now;
  const seenNotifications = new Set<string>();
  const recentlyDeleted = new Map<string, Rewrite>();

  const takeRewrite = (id: string): Rewrite | null => {
    const deleted = recentlyDeleted.get(id);
    recentlyDeleted.delete(id);
    return deleted !== undefined && now() - deleted.at <= REWRITE_WINDOW_MS ? deleted : null;
  };

  const onNew = (payload: unknown): void => {
    const notification = decodeRealtimeNotification(payload);
    if (notification === null || seenNotifications.has(notification.id)) return;
    const rewrite = takeRewrite(notification.id);
    seenNotifications.add(notification.id);
    if (seenNotifications.size > SEEN_NOTIFICATIONS_CAP) {
      const oldest = seenNotifications.values().next().value;
      if (oldest !== undefined) seenNotifications.delete(oldest);
    }
    applyNotificationNew(queryClient, notification, { rewrite: rewrite !== null });
    /* LA CLOCHE SONNE, LE FIL SUIT (#9291) — la notification d'un message
       absent du fil ouvert le relit. */
    const { conversationId, messageId } = notification.context;
    if (MESSAGE_ARRIVAL_NOTIFICATIONS.has(notification.type) && conversationId !== undefined && messageId !== undefined) {
      catchUpThreadMessage(queryClient, { conversationId, messageId });
    }
    /* LA BANNIÈRE IN-APP (#8727) — seulement devant un onglet VISIBLE : un
       onglet caché reçoit le push système, et une bannière posée pendant
       l'absence surgirait, périmée, au retour. */
    if (typeof document === 'undefined' || document.hidden) return;
    const location = { pathname: window.location.pathname };
    /* LA CONVERSATION OUVERTE LIT CE QUI LUI ARRIVE (#18907) — jumelle d'iOS (`NotificationToastManager+Socket`) : une
       réaction, une mention ou une édition arrivée sur le fil à l'écran n'a plus rien à signaler. Elle se marque lue
       (le geste optimiste de la cloche : la ligne, la pastille, la passerelle) au lieu de rester non lue sur tous les
       appareils jusqu'à la prochaine ouverture du fil. Onglet visible seulement ; jamais un appel. */
    if (notificationsApi !== undefined && !notification.state.isRead && !isCallLayerNotification(notification) && conversationOnScreen(notification, location)) {
      void performMarkNotificationRead({ id: notification.id, deps: { ...notificationsApi, queryClient } });
      return;
    }
    /* Une RÉÉCRITURE ne redescend pas : la bannière reprend sa place, remplacée en place par le texte édité,
       seulement si elle était affichée à la suppression et que rien d'autre n'a pris sa place depuis. */
    if (rewrite !== null && !(rewrite.wasShowing && inAppBannerStore.getState().current === null)) return;
    offerInAppBanner(notification, location);
  };

  /* Un id supprimé qui revient est une notification RÉÉCRITE (édition :
     `notification:deleted` puis `notification:new`, même identité) — la
     mémoire de dédoublonnage l'oublie pour la laisser reprendre sa place, et
     la suppression retire AUSSITÔT sa bannière (le contenu peut avoir été
     supprimé pour tous) en retenant si elle était affichée (#18907). */
  const onDeleted = (payload: unknown): void => {
    const id = notificationIdOf(payload);
    if (id !== null) {
      seenNotifications.delete(id);
      recentlyDeleted.set(id, { at: now(), wasShowing: inAppBannerStore.getState().current?.id === id });
      if (recentlyDeleted.size > REWRITES_CAP) {
        const oldest = recentlyDeleted.keys().next().value;
        if (oldest !== undefined) recentlyDeleted.delete(oldest);
      }
      retractInAppBanner(id);
    }
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

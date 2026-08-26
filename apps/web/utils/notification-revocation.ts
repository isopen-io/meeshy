/**
 * La révocation d'une bannière déjà LIVRÉE — la règle PURE « quelles
 * notifications fermer », et son application à toutes les registrations.
 *
 * Le serveur retire une notification (réaction défaite, message ou post
 * supprimé) par deux canaux : le socket (`notification:deleted`, un id) et un
 * push de CONTRÔLE data-only `notification_revoked` (ids joints par virgule,
 * conversations alignées). Les deux se rejoignent ici.
 *
 * SUR LE WEB, seul le canal SOCKET est alimenté. La passerelle ne vise que les
 * plateformes mobiles avec le push de révocation
 * (`NOTIFICATION_REVOCATION_PUSH_PLATFORMS`, gateway) : un data-only sans
 * `webpush.notification` fait afficher à Chrome sa bannière générique dès que
 * le budget d'engagement du site est épuisé — une notification FANTÔME, chez
 * quelqu'un qui n'avait peut-être rien à faire disparaître. Un onglet FERMÉ
 * garde donc sa bannière jusqu'au clic, choix assumé. Les handlers de push des
 * deux Service Workers restent en place, inertes tant que ce choix tient : ils
 * sont la moitié réceptrice d'un contrat que le serveur peut réactiver sans
 * redéployer un Service Worker.
 *
 * Une bannière est désignée par `data.notificationId` — la clé que le push
 * nominal pose toujours. Une bannière SANS cette identité (agrégée par
 * conversation, ou affichée par un chemin qui ne la porte pas) ne peut l'être
 * que par sa conversation ; une bannière QUI l'a n'est jamais fermée pour sa
 * seule conversation, parce qu'elle annonce peut-être un autre message, encore
 * valide.
 *
 * MIROIR : `parseNotificationRevocation` et `selectRevokedNotifications` sont
 * recopiées à l'identique dans `public/sw.js` et
 * `public/firebase-messaging-sw.js` — un Service Worker ne peut pas importer
 * ce module. Toute évolution touche les TROIS sites.
 */

export const NOTIFICATION_REVOKED_PUSH_TYPE = 'notification_revoked';

export type NotificationRevocation = {
  readonly notificationIds: readonly string[];
  /** Même longueur que `notificationIds` quand présent ; `''` sans conversation. */
  readonly conversationIds: readonly string[];
};

type RevocablePushData = {
  readonly type?: unknown;
  readonly notificationIds?: unknown;
  readonly conversationIds?: unknown;
};

/** La charge `data` du push de contrôle → la révocation qu'elle décrit, ou `null`. */
export function parseNotificationRevocation(data: unknown): NotificationRevocation | null {
  if (!data || typeof data !== 'object') return null;
  const { type, notificationIds, conversationIds } = data as RevocablePushData;
  if (type !== NOTIFICATION_REVOKED_PUSH_TYPE || typeof notificationIds !== 'string') return null;
  const ids = notificationIds.split(',').filter((id) => id !== '');
  if (ids.length === 0) return null;
  return {
    notificationIds: ids,
    conversationIds: typeof conversationIds === 'string' ? conversationIds.split(',') : [],
  };
}

/** `notification:deleted` ne nomme qu'un id, et aucune conversation. */
export function revocationOfDeletedNotification(notificationId: string): NotificationRevocation {
  return { notificationIds: [notificationId], conversationIds: [] };
}

type BannerData = {
  readonly notificationId?: unknown;
  readonly conversationId?: unknown;
};

function bannerData(notification: { readonly data?: unknown }): BannerData | null {
  const { data } = notification;
  return data && typeof data === 'object' ? (data as BannerData) : null;
}

export function selectRevokedNotifications<T extends { readonly data?: unknown }>(
  notifications: readonly T[],
  revocation: NotificationRevocation
): T[] {
  const revokedIds = new Set(revocation.notificationIds);
  const revokedConversations = new Set(revocation.conversationIds.filter((id) => id !== ''));
  return notifications.filter((notification) => {
    const data = bannerData(notification);
    if (!data) return false;
    if (typeof data.notificationId === 'string' && data.notificationId !== '') {
      return revokedIds.has(data.notificationId);
    }
    return typeof data.conversationId === 'string' && revokedConversations.has(data.conversationId);
  });
}

type ClosableNotification = { readonly data?: unknown; close(): void };
type NotificationRegistration = { getNotifications(): Promise<readonly ClosableNotification[]> };

/**
 * Ferme les bannières révoquées sur CHAQUE registration — `/sw.js` à la racine
 * et le Service Worker de Firebase sous son propre scope ont tous deux pu
 * l'afficher, et `navigator.serviceWorker.ready` n'en verrait qu'un. Une
 * registration qui échoue n'empêche pas les autres. Rend le nombre fermé.
 */
export async function closeRevokedNotifications(
  registrations: readonly NotificationRegistration[],
  revocation: NotificationRevocation
): Promise<number> {
  const closedPerRegistration = await Promise.all(
    registrations.map(async (registration) => {
      const shown = await registration.getNotifications().catch(() => [] as readonly ClosableNotification[]);
      const revoked = selectRevokedNotifications(shown, revocation);
      revoked.forEach((notification) => notification.close());
      return revoked.length;
    })
  );
  return closedPerRegistration.reduce((total, count) => total + count, 0);
}

/**
 * Le point d'entrée de la PAGE : ferme les bannières révoquées dans tous les
 * Service Workers de l'origine. Sans effet hors navigateur ou sans support.
 */
export async function closeDeliveredNotifications(revocation: NotificationRevocation): Promise<number> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 0;
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  return closeRevokedNotifications(registrations, revocation);
}

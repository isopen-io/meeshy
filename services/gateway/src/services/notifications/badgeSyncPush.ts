import type { SendPushOptions } from '../PushNotificationService';

/**
 * Le push « BADGE SEUL » (#18910, serveur-transport-6) : la pastille de l'icône
 * iOS redescend après une lecture faite ailleurs, sans bannière ni son.
 *
 * Sans lui, un iPhone dont l'app est fermée garde le dernier chiffre poussé
 * jusqu'au prochain push ou à l'ouverture de l'app : on lit les trois messages
 * sur le web, l'icône dit toujours « 3 » pendant des heures.
 *
 * Ce n'est PAS un push silencieux (`silent` retire le badge, et iOS bride le
 * background) : un `aps = { badge }` seul, en-tête `apns-push-type: alert` et
 * priorité 5 — Apple l'applique sans rien afficher. Aucune des clés qui
 * montreraient quelque chose (alert, sound, mutable-content) n'y figure.
 *
 * ADDITIF (#9223) : un ancien iOS applique le badge, comme il le fait de tout
 * `aps.badge`. Android n'est pas visé — pas de pastille sans bannière ; ses
 * bannières lues partent par la révocation (`notificationRevocationPush`).
 *
 * `collapseId` par compte : deux synchronisations en vol se remplacent, seule la
 * dernière compte.
 */
export const BADGE_SYNC_PUSH_TYPE = 'badge_sync';

export function isBadgeSyncPush(payload: { readonly data?: Readonly<Record<string, string>> }): boolean {
  return payload.data?.type === BADGE_SYNC_PUSH_TYPE;
}

export function buildBadgeSyncPush(userId: string, badge: number): SendPushOptions {
  return {
    userId,
    payload: {
      title: '',
      body: '',
      badge,
      collapseId: `badge-${userId}`,
      data: { type: BADGE_SYNC_PUSH_TYPE, unreadCount: String(badge) },
    },
    // `voip` exclu : un push de pastille vers PushKit ferait sonner un faux appel.
    types: ['apns', 'fcm'],
    platforms: ['ios'],
  };
}

import type { AndroidNotification } from 'firebase-admin/messaging';
import type { PushNotificationPayload } from './PushNotificationService';

/**
 * CE QUE PORTE UNE BANNIÈRE ANDROID — le bloc `android.notification` d'un
 * message FCM qui n'est pas data-only, jumeau de `webPushConfig`
 * (`web-push-config.ts`). Il lit les mêmes réglages de livraison (#7308) :
 *
 * - `muted` (`soundEnabled:false`) → aucune clé `sound`, et le canal MUET
 *   (#8678) : depuis Android 8, c'est le CANAL qui sonne, pas la clé.
 *   `meeshy_notifications` est sonore ; la coque crée
 *   `meeshy_notifications_silent` sans son ni vibration
 *   (`SilentNotificationChannel.java`), comme `silent` sur le web. Une coque
 *   qui ne l'a pas retombe sur le canal par défaut du manifeste ;
 * - `badge` → `notificationCount`, l'analogue de `aps.badge` ;
 * - `threadId` → `tag` (#8171) : la bannière la plus récente d'une
 *   conversation REMPLACE la précédente, comme le `tag` web et
 *   `aps['thread-id']`. Sans lui, chaque message levait une bannière de plus
 *   et `groupNotifications` n'avait aucun effet sur Android.
 *   `groupNotifications:false` a retiré `threadId` : une bannière par message.
 * - sans `threadId`, `data.notificationId` → `tag` (#8201), le repli de
 *   `livraison` (`sw-push.js`) : une notification RÉÉCRITE (édition) ou livrée
 *   deux fois remplace SA bannière. `collapseKey` ne fusionne que ce qui attend
 *   encore chez FCM, jamais une bannière déjà affichée : sans ce tag, l'ancien
 *   texte restait dans le tiroir. La coque annule aussi, par ce même tag, les
 *   bannières que `notification_revoked` retire (#8624).
 *
 * `channelId` est celui que la coque crée au démarrage
 * (`SHELL_PUSH_CHANNEL_ID`, `apps/web/src/lib/push/shell-push.ts`).
 */
export type AndroidPushSource = Pick<PushNotificationPayload, 'title' | 'body' | 'muted' | 'sound' | 'badge' | 'threadId' | 'data'>;

function bannerTag(payload: AndroidPushSource): string {
  return payload.threadId || payload.data?.notificationId || '';
}

export function androidNotificationConfig(payload: AndroidPushSource): AndroidNotification {
  const tag = bannerTag(payload);
  return {
    ...(payload.muted ? {} : { sound: payload.sound || 'default' }),
    channelId: payload.muted ? 'meeshy_notifications_silent' : 'meeshy_notifications',
    ...(payload.badge !== undefined ? { notificationCount: payload.badge } : {}),
    ...(tag ? { tag } : {}),
  };
}

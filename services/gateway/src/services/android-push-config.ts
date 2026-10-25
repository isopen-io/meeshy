import type { AndroidNotification } from 'firebase-admin/messaging';
import { isGameNotificationType } from '@meeshy/shared/utils/game/notifications';
import type { PushNotificationPayload } from './PushNotificationService';
import type { PushRoutingClient } from './push-type-routing';

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
 * (`SHELL_PUSH_CHANNEL_ID`, `apps/web/src/lib/push/shell-push.ts`), sauf :
 *
 * - le JEU (#10266, § 5.16.4) a son canal, `meeshy_game`
 *   (`GameNotificationChannel.java`), pour que « moments à immortaliser » et
 *   les autres notifications du jeu se coupent aussi dans les réglages du
 *   système sans toucher aux messages. Il n'est adressé qu'au jeton de la
 *   COQUE (`android-shell`, `pushRoutingClientOf`) : une coque qui ne l'a pas
 *   encore retombe sur le canal par défaut de son manifeste. L'application
 *   native (`me.meeshy.android`) ne crée pas ce canal et son manifeste ne
 *   déclare aucun canal par défaut : FCM y rangerait la bannière sous son canal
 *   générique, sans bannière. Elle reste donc sur `meeshy_notifications`, comme
 *   tout jeton Android dont le client n'est pas reconnu (#9223) ;
 * - `muted` l'emporte sur le jeu : un lecteur qui a coupé le son ne sonne
 *   jamais, quelle que soit la famille de la notification.
 */
export const ANDROID_DEFAULT_CHANNEL_ID = 'meeshy_notifications';
export const ANDROID_SILENT_CHANNEL_ID = 'meeshy_notifications_silent';
export const ANDROID_GAME_CHANNEL_ID = 'meeshy_game';
export type AndroidPushSource = Pick<PushNotificationPayload, 'title' | 'body' | 'muted' | 'sound' | 'badge' | 'threadId' | 'data'>;
export type AndroidPushTarget = { readonly client: PushRoutingClient | null };

const CLIENTS_WITH_GAME_CHANNEL: ReadonlySet<PushRoutingClient> = new Set(['android-shell']);

function bannerTag(payload: AndroidPushSource): string {
  return payload.threadId || payload.data?.notificationId || '';
}

/**
 * #8860 — la vignette d'une VIDÉO (`thumbnailUrl`, posée par
 * `contentDetailPushFields` sous la retenue du média inline) devient l'image
 * de la bannière système, comme l'`UNNotificationAttachment` iOS. Second
 * verrou : aucune image sous `notificationLocKey`, la DÉCLARATION d'un contenu
 * protégé — une garde de confidentialité échoue en montrant MOINS.
 */
function bannerImage(payload: AndroidPushSource): string | undefined {
  const url = payload.data?.thumbnailUrl;
  if (!url || payload.data?.notificationLocKey) return undefined;
  return url.startsWith('https://') ? url : undefined;
}

function bannerChannel(payload: AndroidPushSource, target: AndroidPushTarget): string {
  if (payload.muted) return ANDROID_SILENT_CHANNEL_ID;
  const createsGameChannel = target.client !== null && CLIENTS_WITH_GAME_CHANNEL.has(target.client);
  return createsGameChannel && isGameNotificationType(payload.data?.type) ? ANDROID_GAME_CHANNEL_ID : ANDROID_DEFAULT_CHANNEL_ID;
}

export function androidNotificationConfig(
  payload: AndroidPushSource,
  target: AndroidPushTarget = { client: null },
): AndroidNotification {
  const tag = bannerTag(payload);
  const imageUrl = bannerImage(payload);
  return {
    ...(payload.muted ? {} : { sound: payload.sound || 'default' }),
    channelId: bannerChannel(payload, target),
    ...(payload.badge !== undefined ? { notificationCount: payload.badge } : {}),
    ...(tag ? { tag } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

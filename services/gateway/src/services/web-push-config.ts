import { createHash } from 'node:crypto';
import type { WebpushConfig } from 'firebase-admin/messaging';
import type { PushNotificationPayload } from './PushNotificationService';

/**
 * CE QUE PORTE UN PUSH WEB — le bloc `webpush` d'un message FCM, composé
 * depuis la charge que le chokepoint de préférences (GW8) vient de produire.
 *
 * Il reçoit les trois réglages de livraison que les branches iOS et Android
 * lisent déjà (#7308) :
 *
 * - `muted` (`soundEnabled:false`) → `silent` : la bannière reste VISIBLE,
 *   sans son. Rien à voir avec `payload.silent` (push background invisible),
 *   qui rend le message data-only et ne compose aucun bloc `webpush`.
 * - `threadId` → `tag` : la bannière la plus récente d'une conversation
 *   remplace la précédente — l'analogue de `aps['thread-id']`. Une
 *   remplaçante n'alerte qu'avec `renotify` ; sans lui, chaque message après
 *   le premier arriverait sans annonce chez tout worker qui affiche ce bloc
 *   tel quel (SDK Firebase de l'ancien worker). `renotify` accompagne aussi
 *   une bannière muette — `silent` retire le son, pas l'annonce — et ne
 *   voyage JAMAIS sans `tag` : la paire lève un TypeError dans
 *   `showNotification`. `groupNotifications:false` a retiré `threadId`.
 * - `collapseId` → en-tête `Topic` (RFC 8030 § 5.4), le pendant web de
 *   `apns-collapse-id` / `collapseKey`.
 */
export type WebPushSource = Pick<
  PushNotificationPayload,
  'title' | 'body' | 'link' | 'data' | 'muted' | 'threadId' | 'collapseId'
>;

const BANNER_ICON = '/android-chrome-192x192.png';
const BANNER_BADGE = '/badge-72x72.png';

/**
 * RFC 8030 § 5.4 : un `Topic` tient en 32 caractères au plus de l'alphabet
 * base64url, et un service de push DOIT répondre 400 à toute autre valeur —
 * le message est alors PERDU, pas seulement non regroupé. Une valeur conforme
 * passe telle quelle ; une autre est condensée en un sujet conforme et
 * STABLE, pour que deux pushes de même `collapseId` se remplacent encore.
 */
const RFC8030_TOPIC = /^[A-Za-z0-9_-]{1,32}$/;

export function webPushTopic(collapseId: string): string {
  return RFC8030_TOPIC.test(collapseId)
    ? collapseId
    : createHash('sha256').update(collapseId).digest('base64url').slice(0, 32);
}

export function webPushConfig(payload: WebPushSource): WebpushConfig {
  const link =
    payload.link || (payload.data?.conversationId ? `/conversations/${payload.data.conversationId}` : undefined);
  return {
    notification: {
      title: payload.title,
      body: payload.body,
      icon: BANNER_ICON,
      badge: BANNER_BADGE,
      ...(payload.muted ? { silent: true } : {}),
      ...(payload.threadId ? { tag: payload.threadId, renotify: true } : {}),
    },
    ...(link ? { fcmOptions: { link } } : {}),
    ...(payload.collapseId ? { headers: { Topic: webPushTopic(payload.collapseId) } } : {}),
  };
}

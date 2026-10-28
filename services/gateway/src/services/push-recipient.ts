import type { PushNotificationPayload } from './PushNotificationService';

/**
 * #13567 — le push FCM nomme le compte qu'il vise. Un appareil dont le compte s'est déconnecté hors ligne garde son
 * jeton rattaché à ce compte : sans ce champ, le client ne peut pas écarter un push qui ne vise plus le compte connecté.
 * Champ AJOUTÉ (rétrocompatible) : un client antérieur l'ignore.
 */
export function withRecipient(payload: PushNotificationPayload, userId: string): PushNotificationPayload {
  return { ...payload, data: { ...(payload.data ?? {}), recipientUserId: userId } };
}
